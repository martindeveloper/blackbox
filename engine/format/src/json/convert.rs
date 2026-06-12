use rustc_hash::FxHashMap as HashMap;

use serde_json::Value as JsonValue;

use blackbox_engine::Condition;
use blackbox_engine::DynamicValue;
use blackbox_engine::EngineError;
use blackbox_engine::Gate;
use blackbox_engine::RelationshipScores;
use blackbox_engine::content::{
    AssetCatalog, AssetUsage, CatalogEntry, ChapterMeta, CharacterCatalog, CharacterDefinition,
    ChoiceAction, ChoiceContent, ChoiceGate, ChoicePresentation, ChoiceResolutionSpec,
    DialogueSide, Effect, GameContent, ItemAction, ItemCatalog, ItemDefinition, MetaCatalog,
    MusicTrack, NodeContent, PreparedLibrary, RollMode, SfxClip, SkillCheckContent,
    SkillCheckOutcome, TextBlock, TextureAsset,
};
use blackbox_engine::expr::{Expr, ExprInput, ExprValue};
use blackbox_engine::state::{GameState, InventoryState, PlayerState, RestoredSnapshot};

use super::resolve::{ensure_prepared_library, resolve_inline_node_content, resolve_node_content};
use super::wire::{
    AssetCatalogWire, AssetUsageWire, CatalogEntryWire, ChapterWire, CharacterCatalogWire,
    CharacterDefinitionWire, ChoiceActionWire, ChoiceContentWire, DialogueSideWire, EffectWire,
    ExprInputWire, ExprValueWire, ExprWire, GameContentWire, GameStateWire, GateNodeWire, GateWire,
    InventoryStateWire, ItemActionWire, ItemCatalogWire, ItemDefinitionWire, MetaCatalogWire,
    PlayerStateWire, RelationshipScoresWire, RollModeWire, SkillCheckContentWire,
    SkillCheckOutcomeWire, TextBlockWire,
};
use super::wire_schema::CHAPTER_SPEC;

pub(crate) fn dynamic_value_from_json(value: &JsonValue) -> Result<DynamicValue, EngineError> {
    match value {
        JsonValue::Bool(b) => Ok(DynamicValue::Bool(*b)),
        JsonValue::Number(n) => {
            let Some(i) = n.as_i64() else {
                return Err(EngineError::ValidationError(
                    "flag number must be an integer".to_string(),
                ));
            };
            Ok(DynamicValue::Number(i as i32))
        }
        JsonValue::String(s) => Ok(DynamicValue::String(s.clone())),
        _ => Err(EngineError::ValidationError(
            "unsupported flag value type".to_string(),
        )),
    }
}

pub(crate) fn dynamic_value_to_json(value: &DynamicValue) -> JsonValue {
    match value {
        DynamicValue::Bool(b) => JsonValue::Bool(*b),
        DynamicValue::Number(n) => JsonValue::from(*n),
        DynamicValue::String(s) => JsonValue::String(s.clone()),
    }
}

pub(crate) struct LibraryWireContext {
    pub prepared: Option<PreparedLibrary>,
    pub source: Option<Vec<u8>>,
}

pub(crate) fn bundle_from_wire(
    scenario: GameContentWire,
    items: ItemCatalogWire,
    characters: CharacterCatalogWire,
    assets: AssetCatalogWire,
    meta: MetaCatalogWire,
    library: LibraryWireContext,
    chapters: Vec<ChapterWire>,
) -> Result<GameContent, EngineError> {
    let LibraryWireContext {
        prepared: prepared_library,
        source: library_source,
    } = library;
    use std::sync::Arc;
    let revision = scenario.revision.clone();
    let default_stats = scenario.default_stats.clone();
    let death_node_wire = scenario.death_node.clone();
    let random_seed = scenario.random_seed;
    let relationship_overrides = scenario.relationship_overrides.clone();
    let (start_node_id, title, chapters_meta, node_chapter, mut nodes) =
        assemble_scenario_graph(scenario, prepared_library.as_ref(), chapters)?;
    let characters = characters_from_wire(characters)?;
    let default_relationships = merge_relationship_defaults(&characters, &relationship_overrides)?;
    let conds = prepared_library.as_ref().map(|l| &l.conditions);

    let death_node_id = if let Some(inline) = death_node_wire {
        let id = "__death__".to_string();
        let mut node =
            resolve_inline_node_content(inline, prepared_library.as_ref(), "scenario deathNode")?;
        node.id = id.clone();
        nodes.insert(id.clone(), node);
        Some(id)
    } else {
        None
    };

    Ok(GameContent {
        title,
        start_node_id,
        chapters: chapters_meta,
        node_chapter,
        revision,
        default_stats,
        random_seed,
        items: items_from_wire(items, conds)?,
        characters,
        default_relationships,
        assets: assets_from_wire(assets),
        nodes,
        death_node_id,
        meta: Arc::new(meta_catalog_from_wire(meta)),
        library_source,
        prepared_library,
    })
}

impl From<CatalogEntryWire> for CatalogEntry {
    fn from(wire: CatalogEntryWire) -> Self {
        CatalogEntry {
            title: wire.title,
            description: wire.description,
            internal: wire.internal,
        }
    }
}

pub(crate) fn meta_catalog_from_wire(wire: MetaCatalogWire) -> MetaCatalog {
    MetaCatalog {
        events: wire
            .events
            .into_iter()
            .map(|(id, entry)| (id, entry.into()))
            .collect(),
        flags: wire
            .flags
            .into_iter()
            .map(|(id, entry)| (id, entry.into()))
            .collect(),
    }
}

type AssembledScenarioGraph = (
    String,
    Option<String>,
    Vec<ChapterMeta>,
    HashMap<String, String>,
    HashMap<String, NodeContent>,
);

fn assemble_scenario_graph(
    scenario: GameContentWire,
    library: Option<&PreparedLibrary>,
    loaded_chapters: Vec<ChapterWire>,
) -> Result<AssembledScenarioGraph, EngineError> {
    if !scenario.chapters.is_empty() {
        if !scenario.nodes.is_empty() {
            return Err(EngineError::ValidationError(
                "scenario must not define both chapters and nodes".to_string(),
            ));
        }
        if loaded_chapters.is_empty() {
            return Err(EngineError::ValidationError(
                "scenario declares chapters but none were loaded".to_string(),
            ));
        }

        let mut chapters_meta = Vec::with_capacity(scenario.chapters.len());
        let mut nodes = HashMap::default();
        let mut node_chapter = HashMap::default();

        for chapter_ref in &scenario.chapters {
            let Some(chapter) = loaded_chapters
                .iter()
                .find(|chapter| chapter.id == chapter_ref.id)
            else {
                chapters_meta.push(ChapterMeta {
                    id: chapter_ref.id.clone(),
                    title: chapter_ref.title.clone(),
                    start_node_id: String::new(),
                    death_node_id: None,
                });
                continue;
            };

            if chapter.id != chapter_ref.id {
                return Err(EngineError::ValidationError(format!(
                    "chapter file '{}' has id '{}', expected '{}'",
                    chapter_ref.file_ref, chapter.id, chapter_ref.id
                )));
            }
            if chapter.title != chapter_ref.title {
                return Err(EngineError::ValidationError(format!(
                    "chapter '{}' title mismatch between scenario ('{}') and chapter file ('{}')",
                    chapter.id, chapter_ref.title, chapter.title
                )));
            }

            chapters_meta.push(ChapterMeta {
                id: chapter.id.clone(),
                title: chapter.title.clone(),
                start_node_id: chapter.start_node_id.clone(),
                death_node_id: chapter.death_node_id.clone(),
            });

            for (key, node) in &chapter.nodes {
                if nodes.contains_key(key) {
                    return Err(EngineError::ValidationError(format!(
                        "duplicate node id '{key}' across chapters"
                    )));
                }
                let context = format!("chapter '{}' node '{key}'", chapter.id);
                let node = resolve_node_content(node.clone(), library, &context)?;
                if key != &node.id {
                    return Err(EngineError::ValidationError(format!(
                        "node key '{key}' does not match node id '{}'",
                        node.id
                    )));
                }
                node_chapter.insert(key.clone(), chapter.id.clone());
                nodes.insert(key.clone(), node);
            }
        }

        let start_node_id = scenario
            .chapters
            .iter()
            .find_map(|chapter_ref| {
                loaded_chapters
                    .iter()
                    .find(|chapter| chapter.id == chapter_ref.id)
                    .map(|chapter| chapter.start_node_id.clone())
            })
            .ok_or_else(|| {
                EngineError::ValidationError(
                    "scenario declares chapters but none were loaded".to_string(),
                )
            })?;

        return Ok((
            start_node_id,
            scenario.title,
            chapters_meta,
            node_chapter,
            nodes,
        ));
    }

    let start_node_id = scenario.start_node_id.ok_or_else(|| {
        EngineError::ValidationError("scenario must define startNodeId or chapters".to_string())
    })?;

    let mut nodes = HashMap::default();
    for (id, node) in scenario.nodes {
        let context = format!("scenario node '{id}'");
        let node = resolve_node_content(node, library, &context)?;
        nodes.insert(id, node);
    }

    Ok((
        start_node_id,
        scenario.title,
        Vec::new(),
        HashMap::default(),
        nodes,
    ))
}

pub fn merge_chapter_document(
    content: &mut GameContent,
    chapter_bytes: impl AsRef<[u8]>,
) -> Result<(), EngineError> {
    let chapter =
        decode_chapter_msgpack_document::<ChapterWire>(chapter_bytes.as_ref(), "chapter")?;
    validate_document_envelope(
        "chapter",
        &chapter.spec,
        CHAPTER_SPEC,
        chapter.format_version,
    )?;

    let chapter_meta = content
        .chapters
        .iter()
        .find(|meta| meta.id == chapter.id)
        .ok_or_else(|| {
            EngineError::ValidationError(format!(
                "chapter '{}' is not listed in scenario manifest",
                chapter.id
            ))
        })?;

    if chapter.title != chapter_meta.title {
        return Err(EngineError::ValidationError(format!(
            "chapter '{}' title mismatch between scenario ('{}') and chapter file ('{}')",
            chapter.id, chapter_meta.title, chapter.title
        )));
    }

    if content
        .node_chapter
        .values()
        .any(|owner| owner == &chapter.id)
    {
        return Err(EngineError::ValidationError(format!(
            "chapter '{}' is already loaded",
            chapter.id
        )));
    }

    if let Some(meta) = content
        .chapters
        .iter_mut()
        .find(|meta| meta.id == chapter.id)
    {
        meta.start_node_id = chapter.start_node_id.clone();
        meta.death_node_id = chapter.death_node_id.clone();
    }

    ensure_prepared_library(content)?;
    let library = content.prepared_library.clone();

    for (key, node) in &chapter.nodes {
        if content.nodes.contains_key(key) {
            return Err(EngineError::ValidationError(format!(
                "duplicate node id '{key}' across chapters"
            )));
        }
        let context = format!("chapter '{}' node '{key}'", chapter.id);
        let node = resolve_node_content(node.clone(), library.as_ref(), &context)?;
        if key != &node.id {
            return Err(EngineError::ValidationError(format!(
                "node key '{key}' does not match node id '{}'",
                node.id
            )));
        }
        content.node_chapter.insert(key.clone(), chapter.id.clone());
        content.nodes.insert(key.clone(), node);
    }

    Ok(())
}

fn decode_chapter_msgpack_document<T: serde::de::DeserializeOwned>(
    bytes: impl AsRef<[u8]>,
    label: &str,
) -> Result<T, EngineError> {
    rmp_serde::from_slice(bytes.as_ref()).map_err(|error| EngineError::ContentDecodeError {
        format: "msgpack".to_string(),
        message: format!("{label}: {error}"),
    })
}

pub(crate) fn chapters_from_wire_bytes(
    chapters: &[impl AsRef<[u8]>],
) -> Result<Vec<ChapterWire>, EngineError> {
    let mut loaded = Vec::with_capacity(chapters.len());
    for (index, chapter) in chapters.iter().enumerate() {
        let chapter: ChapterWire = serde_json::from_slice(chapter.as_ref()).map_err(|error| {
            EngineError::ContentDecodeError {
                format: "json".to_string(),
                message: format!("chapter[{index}]: {error}"),
            }
        })?;
        validate_document_envelope(
            &format!("chapter[{index}]"),
            &chapter.spec,
            CHAPTER_SPEC,
            chapter.format_version,
        )?;
        loaded.push(chapter);
    }
    Ok(loaded)
}

fn validate_document_envelope(
    document: &str,
    spec: &str,
    expected_spec: &str,
    format_version: u32,
) -> Result<(), EngineError> {
    super::wire_schema::validate_document_envelope(document, spec, expected_spec, format_version)
}

pub(crate) fn state_from_wire(wire: GameStateWire) -> Result<GameState, EngineError> {
    let mut flags = HashMap::default();
    for (key, value) in wire.flags {
        flags.insert(key, dynamic_value_from_json(&value)?);
    }

    Ok(GameState::restored(RestoredSnapshot {
        current_node_id: wire.current_node_id,
        revision: wire.revision,
        player: PlayerState {
            stats: wire.player.stats,
        },
        inventory: InventoryState {
            items: wire.inventory.items,
        },
        flags,
        relationships: relationships_from_wire(wire.relationships),
        events: wire.events,
        visited_nodes: wire.visited_nodes,
        ambient_music: wire.ambient_music,
        ambient_background: wire.ambient_background,
        random_seed: wire.random_seed,
        random_counter: wire.random_counter,
        choice_attempts: wire.choice_attempts,
    }))
}

pub(crate) fn state_to_wire(state: &GameState) -> GameStateWire {
    GameStateWire {
        current_node_id: state.current_node_id.clone(),
        revision: state.revision.clone(),
        player: PlayerStateWire {
            stats: state.player.stats.clone(),
        },
        inventory: InventoryStateWire {
            items: state.inventory.items.clone(),
        },
        flags: state
            .flags
            .iter()
            .map(|(key, value)| (key.clone(), dynamic_value_to_json(value)))
            .collect(),
        relationships: relationships_to_wire(&state.relationships),
        events: state.events.clone(),
        visited_nodes: state.visited_nodes.clone(),
        ambient_music: state.ambient_music.clone(),
        ambient_background: state.ambient_background.clone(),
        random_seed: state.random_seed,
        random_counter: state.random_counter,
        choice_attempts: state.choice_attempts.clone(),
    }
}

fn characters_from_wire(wire: CharacterCatalogWire) -> Result<CharacterCatalog, EngineError> {
    let mut characters = HashMap::default();
    for (key, character) in wire.characters {
        let character = character_definition_from_wire(character)?;
        if key != character.id {
            return Err(EngineError::ValidationError(format!(
                "character key '{key}' does not match character id '{}'",
                character.id
            )));
        }
        characters.insert(key, character);
    }
    Ok(CharacterCatalog { characters })
}

fn character_definition_from_wire(
    wire: CharacterDefinitionWire,
) -> Result<CharacterDefinition, EngineError> {
    Ok(CharacterDefinition {
        id: wire.id,
        name: wire.name,
        subtitle: wire.subtitle,
        portrait_ref: wire.portrait_ref,
        voice_ref: wire.voice_ref,
        color: wire.color,
        relationships: RelationshipScores(wire.relationships.0),
    })
}

fn merge_relationship_defaults(
    characters: &CharacterCatalog,
    overrides: &HashMap<String, RelationshipScoresWire>,
) -> Result<HashMap<String, RelationshipScores>, EngineError> {
    let mut merged = HashMap::default();

    for (character_id, character) in &characters.characters {
        if !character.relationships.0.is_empty() {
            merged.insert(character_id.clone(), character.relationships.clone());
        }
    }

    for (character_id, override_scores) in overrides {
        let Some(character) = characters.characters.get(character_id) else {
            return Err(EngineError::ValidationError(format!(
                "relationshipOverrides references unknown character '{character_id}'"
            )));
        };

        let entry = merged.entry(character_id.clone()).or_default();

        for (metric, value) in &override_scores.0 {
            if !character.relationships.0.contains_key(metric) {
                return Err(EngineError::ValidationError(format!(
                    "relationshipOverrides for '{character_id}' references undeclared metric '{metric}'"
                )));
            }
            entry.0.insert(metric.clone(), *value);
        }
    }

    Ok(merged)
}

fn default_relationships_from_wire(
    wire: HashMap<String, RelationshipScoresWire>,
) -> HashMap<String, RelationshipScores> {
    wire.into_iter()
        .map(|(id, scores)| (id, RelationshipScores(scores.0)))
        .collect()
}

fn relationships_from_wire(
    wire: HashMap<String, RelationshipScoresWire>,
) -> HashMap<String, RelationshipScores> {
    default_relationships_from_wire(wire)
}

fn relationships_to_wire(
    relationships: &HashMap<String, RelationshipScores>,
) -> HashMap<String, RelationshipScoresWire> {
    relationships
        .iter()
        .map(|(id, scores)| (id.clone(), RelationshipScoresWire(scores.0.clone())))
        .collect()
}

fn items_from_wire(wire: ItemCatalogWire, conds: CondMap<'_>) -> Result<ItemCatalog, EngineError> {
    let mut items = HashMap::default();
    for (key, item) in wire.items {
        let item = item_definition_from_wire(item, conds)?;
        if key != item.id {
            return Err(EngineError::ValidationError(format!(
                "item key '{key}' does not match item id '{}'",
                item.id
            )));
        }
        items.insert(key, item);
    }
    Ok(ItemCatalog { items })
}

fn item_definition_from_wire(
    wire: ItemDefinitionWire,
    conds: CondMap<'_>,
) -> Result<ItemDefinition, EngineError> {
    Ok(ItemDefinition {
        id: wire.id,
        name: wire.name,
        description: wire.description,
        examine_text: wire.examine_text,
        icon_ref: wire.icon_ref,
        actions: wire
            .actions
            .into_iter()
            .map(|a| item_action_from_wire(a, conds))
            .collect::<Result<_, _>>()?,
    })
}

pub(crate) type CondMap<'a> = Option<&'a HashMap<String, Gate>>;

fn optional_requires_from_wire(
    wire: GateWire,
    conds: CondMap<'_>,
) -> Result<Option<Gate>, EngineError> {
    match wire {
        GateWire::All(items) if items.is_empty() => Ok(None),
        other => Ok(Some(gate_from_wire(other, conds)?)),
    }
}

fn choice_gate_from_wire(
    requires: GateWire,
    when: Option<GateWire>,
    unless: Option<GateWire>,
    disabled_reason: Option<String>,
    when_disabled_reason: Option<String>,
    unless_disabled_reason: Option<String>,
    conds: CondMap<'_>,
) -> Result<ChoiceGate, EngineError> {
    Ok(ChoiceGate {
        requires: optional_requires_from_wire(requires, conds)?,
        when: when.map(|w| gate_from_wire(w, conds)).transpose()?,
        unless: unless.map(|w| gate_from_wire(w, conds)).transpose()?,
        disabled_reason,
        when_disabled_reason,
        unless_disabled_reason,
        compiled_requires: None,
        compiled_when: None,
        compiled_unless: None,
    })
}

fn item_action_from_wire(
    wire: ItemActionWire,
    conds: CondMap<'_>,
) -> Result<ItemAction, EngineError> {
    Ok(ItemAction {
        id: wire.id,
        label: wire.label,
        gate: choice_gate_from_wire(
            wire.requires,
            wire.when,
            wire.unless,
            wire.disabled_reason,
            wire.when_disabled_reason,
            wire.unless_disabled_reason,
            conds,
        )?,
        effects: wire
            .effects
            .into_iter()
            .map(effect_from_wire)
            .collect::<Result<_, _>>()?,
        goto: wire.goto,
        consume: wire.consume,
    })
}

fn asset_usage_from_wire(usage: AssetUsageWire) -> AssetUsage {
    match usage {
        AssetUsageWire::Internal => AssetUsage::Internal,
        AssetUsageWire::External => AssetUsage::External,
    }
}

fn assets_from_wire(wire: AssetCatalogWire) -> AssetCatalog {
    AssetCatalog {
        music: wire
            .music
            .into_iter()
            .map(|(id, track)| {
                (
                    id,
                    MusicTrack {
                        src: track.src,
                        r#loop: track.r#loop,
                        usage: asset_usage_from_wire(track.usage),
                    },
                )
            })
            .collect(),
        sfx: wire
            .sfx
            .into_iter()
            .map(|(id, clip)| {
                (
                    id,
                    SfxClip {
                        src: clip.src,
                        usage: asset_usage_from_wire(clip.usage),
                    },
                )
            })
            .collect(),
        textures: wire
            .textures
            .into_iter()
            .map(|(id, texture)| {
                (
                    id,
                    TextureAsset {
                        src: texture.src,
                        usage: asset_usage_from_wire(texture.usage),
                    },
                )
            })
            .collect(),
        default_choice_sfx: wire.default_choice_sfx,
        resolved: Default::default(),
    }
}

pub(crate) fn text_block_from_wire(
    wire: TextBlockWire,
    conds: CondMap<'_>,
) -> Result<TextBlock, EngineError> {
    // `actor` is a character ID; compile to ActorPresent so validation can check the catalog.
    let actor_gate = wire.actor.as_ref().map(|character_id| {
        Gate::Condition(Condition::ActorPresent {
            character_id: character_id.clone(),
            disabled_reason: None,
        })
    });
    let actor = wire.actor;

    let explicit_when = wire.when.map(|w| gate_from_wire(w, conds)).transpose()?;
    let when = match (explicit_when, actor_gate) {
        (Some(w), Some(a)) => Some(Gate::All(vec![a, w])),
        (w, None) => w,
        (None, Some(a)) => Some(a),
    };

    Ok(TextBlock {
        kind: wire.kind,
        text: wire.text,
        else_text: wire.r#else,
        when,
        unless: wire.unless.map(|w| gate_from_wire(w, conds)).transpose()?,
        compiled_when: None,
        compiled_unless: None,
        compiled_text: Vec::new(),
        compiled_else_text: Vec::new(),
        speaker: wire.speaker,
        emotion: wire.emotion,
        side: wire.side.map(dialogue_side_from_wire),
        actor,
    })
}

fn dialogue_side_from_wire(side: DialogueSideWire) -> DialogueSide {
    match side {
        DialogueSideWire::Left => DialogueSide::Left,
        DialogueSideWire::Right => DialogueSide::Right,
        DialogueSideWire::Center => DialogueSide::Center,
    }
}

pub(crate) fn choice_content_from_wire(
    wire: ChoiceContentWire,
    conds: CondMap<'_>,
) -> Result<ChoiceContent, EngineError> {
    Ok(ChoiceContent {
        presentation: ChoicePresentation {
            id: wire.presentation.id,
            label: wire.presentation.label,
            sfx: wire.presentation.sfx,
        },
        gate: choice_gate_from_wire(
            wire.gate.requires,
            wire.gate.when,
            wire.gate.unless,
            wire.gate.disabled_reason,
            wire.gate.when_disabled_reason,
            wire.gate.unless_disabled_reason,
            conds,
        )?,
        resolution: ChoiceResolutionSpec {
            effects: wire
                .resolution
                .effects
                .into_iter()
                .map(effect_from_wire)
                .collect::<Result<_, _>>()?,
            goto: wire.resolution.goto,
            check: wire
                .resolution
                .check
                .map(skill_check_from_wire)
                .transpose()?,
            action: wire.resolution.action.map(choice_action_from_wire),
        },
    })
}

pub(crate) fn gate_from_wire(wire: GateWire, conds: CondMap<'_>) -> Result<Gate, EngineError> {
    match wire {
        GateWire::All(items) => Ok(Gate::All(
            items
                .into_iter()
                .map(|w| gate_from_wire(w, conds))
                .collect::<Result<_, _>>()?,
        )),
        GateWire::One(node) => gate_node_from_wire(node, conds),
    }
}

fn gate_node_from_wire(node: GateNodeWire, conds: CondMap<'_>) -> Result<Gate, EngineError> {
    Ok(match node {
        GateNodeWire::HasItem {
            item_id,
            count,
            disabled_reason,
        } => Gate::Condition(Condition::HasItem {
            item_id,
            count,
            disabled_reason,
        }),
        GateNodeWire::HasFlag {
            flag,
            value,
            disabled_reason,
        } => Gate::Condition(Condition::HasFlag {
            flag,
            value: value.as_ref().map(dynamic_value_from_json).transpose()?,
            disabled_reason,
        }),
        GateNodeWire::StatGte {
            stat,
            value,
            disabled_reason,
        } => Gate::Condition(Condition::StatGte {
            stat,
            value,
            disabled_reason,
        }),
        GateNodeWire::StatLte {
            stat,
            value,
            disabled_reason,
        } => Gate::Condition(Condition::StatLte {
            stat,
            value,
            disabled_reason,
        }),
        GateNodeWire::StatEq {
            stat,
            value,
            disabled_reason,
        } => Gate::Condition(Condition::StatEq {
            stat,
            value,
            disabled_reason,
        }),
        GateNodeWire::Visited {
            node_id,
            disabled_reason,
        } => Gate::Condition(Condition::Visited {
            node_id,
            disabled_reason,
        }),
        GateNodeWire::AtNode {
            node_id,
            disabled_reason,
        } => Gate::Condition(Condition::AtNode {
            node_id,
            disabled_reason,
        }),
        GateNodeWire::RelationshipGte {
            character_id,
            metric,
            value,
            disabled_reason,
        } => Gate::Condition(Condition::RelationshipGte {
            character_id,
            metric,
            value,
            disabled_reason,
        }),
        GateNodeWire::RelationshipLte {
            character_id,
            metric,
            value,
            disabled_reason,
        } => Gate::Condition(Condition::RelationshipLte {
            character_id,
            metric,
            value,
            disabled_reason,
        }),
        GateNodeWire::RelationshipEq {
            character_id,
            metric,
            value,
            disabled_reason,
        } => Gate::Condition(Condition::RelationshipEq {
            character_id,
            metric,
            value,
            disabled_reason,
        }),
        GateNodeWire::All { conditions } => Gate::All(
            conditions
                .into_iter()
                .map(|w| gate_from_wire(w, conds))
                .collect::<Result<_, _>>()?,
        ),
        GateNodeWire::Any { conditions } => Gate::Any(
            conditions
                .into_iter()
                .map(|w| gate_from_wire(w, conds))
                .collect::<Result<_, _>>()?,
        ),
        GateNodeWire::Not { condition } => Gate::Not(Box::new(gate_from_wire(*condition, conds)?)),
        GateNodeWire::ConditionRef { id, .. } => {
            let Some(map) = conds else {
                return Err(EngineError::ValidationError(format!(
                    "condition ref '{id}' used but no library is loaded"
                )));
            };
            map.get(&id).cloned().ok_or_else(|| {
                EngineError::ValidationError(format!(
                    "unknown named condition '{id}' (not defined in library conditions)"
                ))
            })?
        }
        GateNodeWire::ActorPresent {
            character_id,
            disabled_reason,
        } => Gate::Condition(Condition::ActorPresent {
            character_id,
            disabled_reason,
        }),
    })
}

fn choice_action_from_wire(wire: ChoiceActionWire) -> ChoiceAction {
    match wire {
        ChoiceActionWire::RestartGame { start_node_id } => {
            ChoiceAction::RestartGame { start_node_id }
        }
        ChoiceActionWire::OpenLoadMenu => ChoiceAction::OpenLoadMenu,
        ChoiceActionWire::OpenMainMenu => ChoiceAction::OpenMainMenu,
        ChoiceActionWire::GotoChapter {
            chapter_id,
            node_id,
        } => ChoiceAction::GotoChapter {
            chapter_id,
            node_id,
        },
    }
}

fn roll_mode_from_wire(wire: RollModeWire) -> RollMode {
    match wire {
        RollModeWire::Normal => RollMode::Normal,
        RollModeWire::Advantage => RollMode::Advantage,
        RollModeWire::Disadvantage => RollMode::Disadvantage,
    }
}

fn skill_check_from_wire(wire: SkillCheckContentWire) -> Result<SkillCheckContent, EngineError> {
    Ok(SkillCheckContent {
        stat: wire.stat,
        difficulty: wire.difficulty,
        modifier: wire.modifier.map(expr_input_from_wire),
        label: wire.label,
        roll_mode: roll_mode_from_wire(wire.roll_mode),
        max_attempts: wire.max_attempts,
        on_success: skill_check_outcome_from_wire(wire.on_success)?,
        on_failure: skill_check_outcome_from_wire(wire.on_failure)?,
        on_exhausted: wire
            .on_exhausted
            .map(skill_check_outcome_from_wire)
            .transpose()?,
        compiled_modifier: None,
    })
}

fn skill_check_outcome_from_wire(
    wire: SkillCheckOutcomeWire,
) -> Result<SkillCheckOutcome, EngineError> {
    Ok(SkillCheckOutcome {
        effects: wire
            .effects
            .into_iter()
            .map(effect_from_wire)
            .collect::<Result<_, _>>()?,
        goto: wire.goto,
    })
}

pub(crate) fn effect_from_wire(wire: EffectWire) -> Result<Effect, EngineError> {
    Ok(match wire {
        EffectWire::SetFlag {
            flag,
            value,
            value_expr,
        } => Effect::SetFlag {
            flag,
            value: value.as_ref().map(dynamic_value_from_json).transpose()?,
            value_expr: value_expr.map(expr_input_from_wire),
            compiled_value_expr: None,
        },
        EffectWire::ModifyStat {
            stat,
            amount,
            amount_expr,
        } => Effect::ModifyStat {
            stat,
            amount,
            amount_expr: amount_expr.map(expr_input_from_wire),
            compiled_amount_expr: None,
        },
        EffectWire::AddItem {
            item_id,
            count,
            count_expr,
        } => Effect::AddItem {
            item_id,
            count,
            count_expr: count_expr.map(expr_input_from_wire),
            compiled_count_expr: None,
        },
        EffectWire::RemoveItem {
            item_id,
            count,
            count_expr,
        } => Effect::RemoveItem {
            item_id,
            count,
            count_expr: count_expr.map(expr_input_from_wire),
            compiled_count_expr: None,
        },
        EffectWire::AddEvent { event_id } => Effect::AddEvent { event_id },
        EffectWire::PlayMusic { track } => Effect::PlayMusic { track },
        EffectWire::StopMusic => Effect::StopMusic,
        EffectWire::PlaySfx { sfx } => Effect::PlaySfx { sfx },
        EffectWire::Roll {
            sides,
            label,
            store_flag,
        } => Effect::Roll {
            sides,
            label,
            store_flag,
        },
        EffectWire::ModifyRelationship {
            character_id,
            metric,
            amount,
            amount_expr,
        } => Effect::ModifyRelationship {
            character_id,
            metric,
            amount,
            amount_expr: amount_expr.map(expr_input_from_wire),
            compiled_amount_expr: None,
        },
        EffectWire::SetActorPresent {
            character_id,
            value,
        } => Effect::SetActorPresent {
            character_id,
            value,
        },
    })
}

fn expr_input_from_wire(wire: ExprInputWire) -> ExprInput {
    match wire {
        ExprInputWire::String(text) => ExprInput::String(text),
        ExprInputWire::Expr(expr) => ExprInput::Expr(expr_from_wire(expr)),
    }
}

fn expr_from_wire(wire: ExprWire) -> Expr {
    match wire {
        ExprWire::Lit(value) => Expr::Lit(expr_value_from_wire(value)),
        ExprWire::Var { var } => Expr::Var { var },
        ExprWire::Call { call, args } => Expr::Call {
            call,
            args: args.into_iter().map(expr_from_wire).collect(),
        },
        ExprWire::Op { op, left, right } => Expr::Op {
            op,
            left: Box::new(expr_from_wire(*left)),
            right: right.map(|expr| Box::new(expr_from_wire(*expr))),
        },
    }
}

fn expr_value_from_wire(wire: ExprValueWire) -> ExprValue {
    match wire {
        ExprValueWire::Number(n) => ExprValue::Number(n),
        ExprValueWire::Bool(b) => ExprValue::Bool(b),
        ExprValueWire::String(s) => ExprValue::String(s),
    }
}
