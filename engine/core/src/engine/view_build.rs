use bumpalo::Bump;
use std::collections::HashSet;
use std::sync::Arc;

use crate::choice_gate::{ChoiceGateResult, materialize_disabled_reason};
use crate::content::{ChoiceContent, GameContent, NodeContent};
use crate::error::EngineError;
use crate::expr::ReadContext;
use crate::gate::evaluate_gate_readonly;
use crate::relationship::RelationshipScores;
use crate::state::GameState;
use crate::text::resolve_text_blocks;
use crate::view::{
    CharacterView, CheckPreview, ChoiceView, GameView, InventoryItemView, ItemActionView,
    RelationshipMetricView,
};

use super::cache::ItemActionGateEntry;

pub(super) struct ViewBuildContext<'a> {
    pub content: &'a GameContent,
    pub state: &'a GameState,
    pub gate_cache: &'a [ChoiceGateResult],
    pub item_action_cache: &'a [ItemActionGateEntry],
}

pub(super) fn build_game_view(
    ctx: ViewBuildContext<'_>,
    node_id: &str,
) -> Result<GameView, EngineError> {
    let bump = Bump::new();
    let node = ctx
        .content
        .nodes
        .get(node_id)
        .ok_or_else(|| EngineError::UnknownNode(node_id.to_string()))?;

    let music = ctx
        .state
        .ambient_music
        .as_deref()
        .and_then(|track_id| ctx.content.assets.resolve_music(track_id));
    let background = node
        .background_ref
        .as_deref()
        .or(ctx.state.ambient_background.as_deref())
        .and_then(|ref_id| ctx.content.assets.resolve_texture(ref_id));

    let mut choices = Vec::with_capacity(node.choices.len());
    for (choice_index, choice) in node.choices.iter().enumerate() {
        if let Some(view) = build_choice_view(&ctx, choice, choice_index)? {
            choices.push(view);
        }
    }

    let chapter = chapter_meta_for_node(ctx.content, node_id);

    Ok(GameView {
        scenario_title: ctx.content.title.clone(),
        chapter_id: chapter.map(|chapter| chapter.id.clone()),
        chapter_title: chapter.map(|chapter| chapter.title.clone()),
        node_id: node.id.clone(),
        title: node.title.clone(),
        mode: node.mode.clone(),
        text: resolve_text_blocks(&bump, ctx.state, &node.text)?,
        choices,
        music,
        background,
        inventory_items: build_inventory_items(ctx.content, ctx.state),
        item_actions: build_item_actions(ctx.item_action_cache),
        characters: build_characters(ctx.content, ctx.state, node),
        player_stats: ctx.state.player.stats.clone(),
        inventory: ctx.state.inventory.items.clone(),
        flags: ctx.state.flags.clone(),
        events: ctx.state.events.clone(),
        meta: Arc::clone(&ctx.content.meta),
    })
}

fn build_inventory_items(content: &GameContent, state: &GameState) -> Vec<InventoryItemView> {
    let mut items: Vec<_> = state
        .inventory
        .items
        .iter()
        .filter_map(|(ref_id, count)| {
            if *count == 0 {
                return None;
            }
            let item = content.items.get(ref_id)?;
            Some(InventoryItemView {
                ref_id: ref_id.clone(),
                name: item.name.clone(),
                count: *count,
                icon: item
                    .icon_ref
                    .as_deref()
                    .and_then(|icon_ref| content.assets.resolve_texture(icon_ref)),
            })
        })
        .collect();
    items.sort_by(|left, right| left.ref_id.cmp(&right.ref_id));
    items
}

fn build_item_actions(item_action_cache: &[ItemActionGateEntry]) -> Vec<ItemActionView> {
    item_action_cache
        .iter()
        .map(|entry| ItemActionView {
            item_ref: entry.item_ref.clone(),
            action_id: entry.action_id.clone(),
            label: entry.label.clone(),
            enabled: entry.enabled,
            disabled_reason: entry.disabled_reason.clone(),
        })
        .collect()
}

fn build_characters(
    content: &GameContent,
    state: &GameState,
    node: &NodeContent,
) -> Vec<CharacterView> {
    let scene_ids = scene_character_ids(content, state, node);
    let mut characters: Vec<_> = content
        .characters
        .characters
        .values()
        .filter(|character| scene_ids.contains(&character.id))
        .map(|character| {
            let live = state.relationships.get(&character.id);
            let mut keys: Vec<&String> = character.relationships.0.keys().collect();
            keys.sort();
            let metrics = keys
                .into_iter()
                .map(|key| RelationshipMetricView {
                    key: key.clone(),
                    value: live
                        .map(|scores| scores.get(key))
                        .unwrap_or_else(|| character.relationships.get(key)),
                })
                .collect();
            CharacterView {
                ref_id: character.id.clone(),
                name: character.name.clone(),
                subtitle: character.subtitle.clone(),
                portrait: character
                    .portrait_ref
                    .as_deref()
                    .and_then(|ref_id| content.assets.resolve_texture(ref_id)),
                voice_ref: character.voice_ref.clone(),
                color: character.color.clone(),
                metrics,
            }
        })
        .collect();
    characters.sort_by(|left, right| left.ref_id.cmp(&right.ref_id));
    characters
}

fn scene_character_ids(
    content: &GameContent,
    state: &GameState,
    node: &NodeContent,
) -> HashSet<String> {
    let mut ids = HashSet::new();
    let ctx = ReadContext { state };

    for block in &node.text {
        if !text_block_is_visible(&ctx, block) {
            continue;
        }
        if let Some(speaker) = &block.speaker
            && let Some(character_id) = resolve_speaker_character_id(content, speaker)
        {
            ids.insert(character_id);
        }
    }

    for character in content.characters.characters.values() {
        let current = state
            .relationships
            .get(&character.id)
            .cloned()
            .unwrap_or_default();
        let default = content
            .default_relationships
            .get(&character.id)
            .cloned()
            .unwrap_or_default();
        if relationship_scores_differ(&current, &default) {
            ids.insert(character.id.clone());
        }
    }

    ids
}

fn resolve_speaker_character_id(content: &GameContent, speaker: &str) -> Option<String> {
    content
        .characters
        .characters
        .values()
        .find(|character| character.id == speaker || character.name == speaker)
        .map(|character| character.id.clone())
}

fn build_choice_view(
    ctx: &ViewBuildContext<'_>,
    choice: &ChoiceContent,
    choice_index: usize,
) -> Result<Option<ChoiceView>, EngineError> {
    let gate = ctx.gate_cache.get(choice_index).ok_or_else(|| {
        EngineError::ValidationError(format!(
            "gate cache missing choice '{}'",
            choice.presentation.id
        ))
    })?;

    if gate.hidden {
        return Ok(None);
    }

    let check = choice.resolution.check.as_ref().map(|check| {
        let key = format!("{}:{}", ctx.state.current_node_id, choice.presentation.id);
        let attempts_used = ctx.state.choice_attempts.get(&key).copied().unwrap_or(0);
        CheckPreview {
            stat: check.stat.clone(),
            difficulty: check.difficulty,
            label: check.label.clone(),
            roll_mode: check.roll_mode,
            max_attempts: check.max_attempts,
            attempts_used,
        }
    });

    let disabled_reason = materialize_disabled_reason(gate);

    Ok(Some(ChoiceView {
        id: choice.presentation.id.clone(),
        label: choice.presentation.label.clone(),
        enabled: gate.enabled,
        disabled_reason,
        check,
        action: choice.resolution.action.clone(),
        sfx: ctx.content.assets.resolve_sfx_for_choice(choice),
    }))
}

fn chapter_meta_for_node<'a>(
    content: &'a GameContent,
    node_id: &str,
) -> Option<&'a crate::content::ChapterMeta> {
    let chapter_id = content.node_chapter.get(node_id)?;
    content
        .chapters
        .iter()
        .find(|chapter| chapter.id == *chapter_id)
}

fn text_block_is_visible(ctx: &ReadContext<'_>, block: &crate::content::TextBlock) -> bool {
    evaluate_gate_readonly(
        ctx,
        block.compiled_when.as_ref(),
        block.compiled_unless.as_ref(),
    )
    .unwrap_or(false)
}

fn relationship_scores_differ(current: &RelationshipScores, default: &RelationshipScores) -> bool {
    current.0 != default.0
}
