mod cache;
mod view_build;

use std::sync::Arc;

use crate::check::{SkillCheckOverride, resolve_skill_check};
use crate::choice_gate::{ChoiceGateResult, materialize_disabled_reason};
use crate::command::{CommandResult, PlayerCommand};
use crate::content::{ChoiceContent, GameContent, ItemAction, NodeContent};
use crate::effect::{EffectSideEffects, apply_effect};
use crate::error::EngineError;
use crate::format::ContentDecoder;
use crate::item_action::{apply_item_consumption, ensure_item_owned, evaluate_item_action};
use crate::logging::{self, LogLevel};
use crate::rng::DEFAULT_RANDOM_SEED;
use crate::roll_log::RollLog;
use crate::state::GameState;
use crate::transition::ChoiceResolution;
use crate::validation::validate_content;
use crate::view::{GameView, ItemExamineView, SfxCue};

use cache::ItemActionGateEntry;
use view_build::{ViewBuildContext, build_game_view};

enum CommandOutcome {
    Choice {
        view: GameView,
        selected_sfx: Option<Arc<SfxCue>>,
        triggered_sfx: Option<Arc<SfxCue>>,
        rolls: RollLog,
        chapter_changed: bool,
    },
    Examine {
        view: GameView,
        examine: ItemExamineView,
    },
}

pub struct Engine {
    content: GameContent,
    state: GameState,
    gate_cache: Vec<ChoiceGateResult>,
    item_action_cache: Vec<ItemActionGateEntry>,
    skill_check_override: Option<SkillCheckOverride>,
}

impl Engine {
    pub fn load_bundle<F: ContentDecoder>(
        scenario: impl AsRef<[u8]>,
        items: impl AsRef<[u8]>,
        assets: impl AsRef<[u8]>,
        characters: impl AsRef<[u8]>,
        format: &F,
    ) -> Result<Self, EngineError> {
        Self::load_chaptered_bundle(
            scenario,
            items,
            assets,
            characters,
            Vec::<&[u8]>::new(),
            format,
        )
    }

    pub fn load_chaptered_bundle<F: ContentDecoder>(
        scenario: impl AsRef<[u8]>,
        items: impl AsRef<[u8]>,
        assets: impl AsRef<[u8]>,
        characters: impl AsRef<[u8]>,
        chapters: Vec<impl AsRef<[u8]>>,
        format: &F,
    ) -> Result<Self, EngineError> {
        let content =
            format.decode_chaptered_bundle(scenario, items, assets, characters, chapters)?;
        Self::new_game(content)
    }

    pub fn new_game(content: GameContent) -> Result<Self, EngineError> {
        let mut content = content;
        validate_content(&mut content)?;
        logging::info_fields(
            "engine",
            "ready",
            serde_json::json!({
                "start_node": content.start_node_id,
                "revision": content.revision,
                "nodes": content.nodes.len(),
            }),
        );
        let state = Self::fresh_state_from_content(&content, content.start_node_id.clone());
        let mut engine = Self {
            content,
            state,
            gate_cache: Vec::new(),
            item_action_cache: Vec::new(),
            skill_check_override: None,
        };
        engine.run_on_enter_effects(&mut RollLog::new(), &mut EffectSideEffects::default())?;
        engine.apply_post_mutation_state(&mut RollLog::new(), &mut EffectSideEffects::default())?;
        engine.mark_current_visited();
        Ok(engine)
    }

    pub fn get_state(&self) -> &GameState {
        &self.state
    }

    pub fn get_current_view(&mut self) -> Result<GameView, EngineError> {
        self.view_for_current_node()
    }

    pub fn debug_goto_node(&mut self, node_id: &str) -> Result<GameView, EngineError> {
        self.require_node(node_id)?;
        let changed = self.state.current_node_id != node_id;
        self.state.current_node_id = node_id.to_string();
        if changed {
            self.clear_gate_caches();
        }
        self.finish_mutation(
            changed,
            &mut RollLog::new(),
            &mut EffectSideEffects::default(),
        )?;
        self.refresh_view_for_current_node()
    }

    pub fn debug_change_chapter(
        &mut self,
        chapter_id: &str,
        node_id: Option<&str>,
    ) -> Result<GameView, EngineError> {
        let target = self.resolve_chapter_target(chapter_id, node_id)?;
        self.debug_goto_node(&target)
    }

    pub fn debug_add_item(&mut self, item_ref: &str, count: u32) -> Result<GameView, EngineError> {
        if self.content.items.get(item_ref).is_none() {
            return Err(EngineError::UnknownItem(item_ref.to_string()));
        }
        let entry = self
            .state
            .inventory
            .items
            .entry(item_ref.to_string())
            .or_insert(0);
        *entry = entry.saturating_add(count);
        self.clear_gate_caches();
        self.refresh_view_for_current_node()
    }

    pub fn debug_remove_item(
        &mut self,
        item_ref: &str,
        count: u32,
    ) -> Result<GameView, EngineError> {
        if self.content.items.get(item_ref).is_none() {
            return Err(EngineError::UnknownItem(item_ref.to_string()));
        }
        if let Some(entry) = self.state.inventory.items.get_mut(item_ref) {
            *entry = entry.saturating_sub(count);
            if *entry == 0 {
                self.state.inventory.items.remove(item_ref);
            }
        }
        self.clear_gate_caches();
        self.refresh_view_for_current_node()
    }

    pub fn debug_kill_player(&mut self) -> Result<GameView, EngineError> {
        self.state.player.stats.insert("hp".to_string(), 0);
        self.finish_mutation(
            false,
            &mut RollLog::new(),
            &mut EffectSideEffects::default(),
        )?;
        self.refresh_view_for_current_node()
    }

    /// Force the next skill check to resolve to a specific branch without rolling.
    /// Cleared automatically after the next [`Self::submit_command`].
    pub fn set_skill_check_override(&mut self, override_outcome: Option<SkillCheckOverride>) {
        self.skill_check_override = override_outcome;
    }

    pub fn submit_command(&mut self, command: PlayerCommand) -> CommandResult {
        logging::debug_lazy("engine", || {
            format!("submit_command: {}", command_summary(&command))
        });
        let result = match self.execute_command(command) {
            Ok(CommandOutcome::Choice {
                view,
                selected_sfx,
                triggered_sfx,
                rolls,
                chapter_changed,
            }) => {
                logging::debug_fields_lazy("engine", "command succeeded", || {
                    serde_json::json!({
                        "node_id": view.node_id,
                        "chapter_changed": chapter_changed,
                        "rolls": rolls.len(),
                        "sfx": selected_sfx.as_ref().map(|cue| cue.ref_id.as_str()),
                        "triggered_sfx": triggered_sfx.as_ref().map(|cue| cue.ref_id.as_str()),
                    })
                });
                CommandResult::success_with_transition(
                    view,
                    selected_sfx,
                    rolls.into_vec(),
                    None,
                    chapter_changed,
                    triggered_sfx,
                )
            }
            Ok(CommandOutcome::Examine { view, examine }) => {
                logging::debug_fields_lazy("engine", "examine succeeded", || {
                    serde_json::json!({
                        "node_id": view.node_id,
                        "item_ref": examine.ref_id,
                    })
                });
                CommandResult::success_with_examine(view, None, Vec::new(), Some(examine))
            }
            Err(error) => {
                if let EngineError::UnknownChoice(ref choice_id) = error {
                    let available =
                        self.content
                            .nodes
                            .get(&self.state.current_node_id)
                            .map(|node| {
                                node.choices
                                    .iter()
                                    .map(|choice| choice.presentation.id.clone())
                                    .collect::<Vec<_>>()
                            });
                    logging::warn_fields(
                        "engine",
                        "unknown choice",
                        serde_json::json!({
                            "node_id": self.state.current_node_id,
                            "choice_id": choice_id,
                            "available": available,
                        }),
                    );
                } else {
                    logging::log(LogLevel::Warn, "engine", format!("command failed: {error}"));
                }
                CommandResult::failure(error)
            }
        };
        self.skill_check_override = None;
        result
    }

    pub fn restore_state(&mut self, state: GameState) -> Result<GameView, EngineError> {
        self.restore_state_no_view(state)?;
        let view = self.get_current_view()?;
        logging::debug_fields_lazy(
            "engine",
            "state restored",
            || serde_json::json!({ "node_id": view.node_id }),
        );
        Ok(view)
    }

    /// Restore `state` without building a [`GameView`]. Callers that immediately
    /// submit a command (and therefore discard the view) avoid paying full view
    /// construction — text resolution and choice gate evaluation — twice.
    pub fn restore_state_no_view(&mut self, mut state: GameState) -> Result<(), EngineError> {
        if let (Some(save_ver), Some(cur_ver)) = (&state.revision, &self.content.revision)
            && save_ver != cur_ver
        {
            return Err(EngineError::RevisionMismatch {
                save: save_ver.clone(),
                current: cur_ver.clone(),
            });
        }

        if !self.content.nodes.contains_key(&state.current_node_id) {
            return Err(EngineError::UnknownNode(state.current_node_id.clone()));
        }

        self.skill_check_override = None;
        logging::debug_fields_lazy("engine", "restoring state", || {
            serde_json::json!({
                "node_id": state.current_node_id,
                "revision": state.revision,
                "relationships": state.relationships.len(),
            })
        });
        state.backfill_relationship_defaults(&self.content.default_relationships);
        self.state = state;
        self.state.ensure_lookup_sets();
        self.apply_post_mutation_state(&mut RollLog::new(), &mut EffectSideEffects::default())?;
        self.clear_gate_caches();
        Ok(())
    }

    pub fn merge_chapter<F: ContentDecoder>(
        &mut self,
        chapter: impl AsRef<[u8]>,
        format: &F,
    ) -> Result<(), EngineError> {
        format.merge_chapter_document(&mut self.content, chapter)?;
        validate_content(&mut self.content)?;
        self.clear_gate_caches();
        Ok(())
    }

    pub fn load_catalog(&mut self, meta: crate::content::MetaCatalog) {
        self.content.meta = Arc::new(meta);
    }

    pub fn load_library_source(&mut self, library: Vec<u8>) {
        self.content.library_source = Some(library);
        self.content.prepared_library = None;
    }

    pub fn unload_chapter(&mut self, chapter_id: &str) -> Result<(), EngineError> {
        if !self
            .content
            .chapters
            .iter()
            .any(|chapter| chapter.id == chapter_id)
        {
            return Err(EngineError::ValidationError(format!(
                "unknown chapter '{chapter_id}'"
            )));
        }

        if self
            .chapter_id_for_node(&self.state.current_node_id)
            .as_deref()
            == Some(chapter_id)
        {
            return Err(EngineError::ValidationError(format!(
                "cannot unload active chapter '{chapter_id}'"
            )));
        }

        let node_ids: Vec<String> = self
            .content
            .node_chapter
            .iter()
            .filter(|&(_, owner)| owner == chapter_id)
            .map(|(node_id, _)| node_id.clone())
            .collect();

        for node_id in node_ids {
            self.content.nodes.remove(&node_id);
            self.content.node_chapter.remove(&node_id);
        }

        self.clear_gate_caches();
        Ok(())
    }

    fn execute_command(&mut self, command: PlayerCommand) -> Result<CommandOutcome, EngineError> {
        match command {
            PlayerCommand::Choose { .. } | PlayerCommand::Continue => {
                self.execute_choice_command(command)
            }
            PlayerCommand::Examine { item_ref } => self.execute_examine_command(item_ref),
            PlayerCommand::UseItem {
                item_ref,
                action_id,
            } => self.execute_use_item_command(item_ref, action_id),
        }
    }

    fn execute_choice_command(
        &mut self,
        command: PlayerCommand,
    ) -> Result<CommandOutcome, EngineError> {
        let node_id = self.state.current_node_id.clone();
        self.ensure_gate_cache_for_id(&node_id)?;
        let choice_index = {
            let node = self.require_node(&node_id)?;
            let (choice_index, choice) = self.resolve_choice(node, command)?;
            logging::debug_fields_lazy("engine", "executing choice", || {
                serde_json::json!({
                    "node_id": node.id,
                    "choice_id": choice.presentation.id,
                })
            });
            self.ensure_choice_enabled(choice_index, choice)?;
            choice_index
        };

        let selected_sfx = self
            .require_node(&node_id)?
            .choices
            .get(choice_index)
            .and_then(|choice| self.content.assets.resolve_sfx_for_choice(choice));
        let mut rolls = RollLog::new();
        let mut side = EffectSideEffects::default();

        let effects = self.require_node(&node_id)?.choices[choice_index]
            .resolution
            .effects
            .clone();
        for effect in &effects {
            apply_effect(&mut self.state, effect, &mut rolls, &mut side)?;
        }

        let previous_chapter = self.chapter_id_for_node(&self.state.current_node_id);
        let resolution = {
            let choice = &self.require_node(&node_id)?.choices[choice_index];
            if let Some(check) = choice.resolution.check.clone() {
                let choice_id = choice.presentation.id.clone();
                resolve_skill_check(
                    &mut self.state,
                    &choice_id,
                    &check,
                    &mut rolls,
                    &mut side,
                    self.skill_check_override,
                )?
            } else {
                choice.transition()
            }
        };

        let node_changed = self.apply_resolution(&resolution)?;
        logging::debug_fields_lazy("engine", "choice resolved", || {
            serde_json::json!({
                "node_changed": node_changed,
                "current_node": self.state.current_node_id,
                "resolution": resolution_summary(&resolution),
            })
        });

        self.finish_mutation(node_changed, &mut rolls, &mut side)?;
        let chapter_changed = self.chapter_changed_since(previous_chapter);
        self.finalize_choice_outcome(rolls, selected_sfx, side, chapter_changed)
    }

    fn execute_examine_command(&mut self, item_ref: String) -> Result<CommandOutcome, EngineError> {
        logging::debug_fields_lazy(
            "engine",
            "executing examine",
            || serde_json::json!({ "item_ref": item_ref }),
        );
        ensure_item_owned(&self.state, &item_ref)?;
        let item = self
            .content
            .items
            .get(&item_ref)
            .ok_or_else(|| EngineError::UnknownItem(item_ref.clone()))?;

        let examine = ItemExamineView {
            ref_id: item.id.clone(),
            name: item.name.clone(),
            description: item.description.clone(),
            examine_text: item
                .examine_text
                .clone()
                .unwrap_or_else(|| item.description.clone()),
            icon: item
                .icon_ref
                .as_deref()
                .and_then(|ref_id| self.content.assets.resolve_texture(ref_id)),
        };

        let view = self.view_for_current_node()?;
        Ok(CommandOutcome::Examine { view, examine })
    }

    fn execute_use_item_command(
        &mut self,
        item_ref: String,
        action_id: Option<String>,
    ) -> Result<CommandOutcome, EngineError> {
        ensure_item_owned(&self.state, &item_ref)?;
        let item = self
            .content
            .items
            .get(&item_ref)
            .ok_or_else(|| EngineError::UnknownItem(item_ref.clone()))?;
        let action = self.resolve_item_action(&item_ref, &item.actions, action_id)?;
        logging::debug_fields_lazy("engine", "executing use item", || {
            serde_json::json!({
                "item_ref": item_ref,
                "action_id": action.id,
            })
        });
        let gate = evaluate_item_action(&self.state, &self.content, &item_ref, action)?;
        if !gate.enabled {
            return Err(EngineError::ItemActionDisabled {
                item_ref,
                action_id: action.id.clone(),
                reason: materialize_disabled_reason(&gate)
                    .unwrap_or_else(|| "Action is not available".to_string()),
            });
        }

        let (goto, consume) = (action.goto.clone(), action.consume);
        let mut rolls = RollLog::new();
        let mut side = EffectSideEffects::default();
        for effect in &action.effects {
            apply_effect(&mut self.state, effect, &mut rolls, &mut side)?;
        }

        let previous_chapter = self.chapter_id_for_node(&self.state.current_node_id);
        let node_changed = if let Some(goto) = goto {
            self.apply_resolution(&ChoiceResolution::Goto { node_id: goto })?
        } else {
            false
        };

        if consume {
            apply_item_consumption(&mut self.state, &item_ref);
        }

        self.finish_mutation(node_changed, &mut rolls, &mut side)?;
        let chapter_changed = self.chapter_changed_since(previous_chapter);
        self.finalize_choice_outcome(rolls, None, side, chapter_changed)
    }

    fn finish_mutation(
        &mut self,
        node_changed: bool,
        rolls: &mut RollLog,
        side: &mut EffectSideEffects,
    ) -> Result<(), EngineError> {
        if node_changed {
            self.run_on_enter_effects(rolls, side)?;
        }
        self.apply_post_mutation_state(rolls, side)?;
        self.mark_current_visited();
        Ok(())
    }

    fn finalize_choice_outcome(
        &mut self,
        rolls: RollLog,
        selected_sfx: Option<Arc<SfxCue>>,
        side: EffectSideEffects,
        chapter_changed: bool,
    ) -> Result<CommandOutcome, EngineError> {
        let triggered_sfx = side
            .triggered_sfx
            .as_deref()
            .and_then(|sfx| self.content.assets.resolve_sfx(sfx));
        let view = self.refresh_view_for_current_node()?;
        Ok(CommandOutcome::Choice {
            view,
            selected_sfx,
            triggered_sfx,
            rolls,
            chapter_changed,
        })
    }

    fn view_for_current_node(&mut self) -> Result<GameView, EngineError> {
        let node_id = self.state.current_node_id.clone();
        self.ensure_gate_cache_for_id(&node_id)?;
        self.ensure_item_action_cache()?;
        self.build_view(&node_id)
    }

    fn refresh_view_for_current_node(&mut self) -> Result<GameView, EngineError> {
        let node_id = self.state.current_node_id.clone();
        self.refresh_caches_for_node(&node_id)?;
        self.build_view(&node_id)
    }

    fn build_view(&self, node_id: &str) -> Result<GameView, EngineError> {
        build_game_view(
            ViewBuildContext {
                content: &self.content,
                state: &self.state,
                gate_cache: &self.gate_cache,
                item_action_cache: &self.item_action_cache,
            },
            node_id,
        )
    }

    fn chapter_changed_since(&self, previous_chapter: Option<String>) -> bool {
        previous_chapter != self.chapter_id_for_node(&self.state.current_node_id)
    }

    pub(super) fn require_node(&self, node_id: &str) -> Result<&NodeContent, EngineError> {
        self.content
            .nodes
            .get(node_id)
            .ok_or_else(|| EngineError::UnknownNode(node_id.to_string()))
    }

    fn resolve_item_action<'a>(
        &self,
        item_ref: &str,
        actions: &'a [ItemAction],
        action_id: Option<String>,
    ) -> Result<&'a ItemAction, EngineError> {
        if let Some(action_id) = action_id {
            return actions.iter().find(|action| action.id == action_id).ok_or(
                EngineError::UnknownItemAction {
                    item_ref: item_ref.to_string(),
                    action_id,
                },
            );
        }

        let enabled: Vec<&ItemAction> = actions
            .iter()
            .filter(|action| {
                evaluate_item_action(&self.state, &self.content, item_ref, action)
                    .map(|gate| gate.enabled)
                    .unwrap_or(false)
            })
            .collect();

        match enabled.len() {
            0 => Err(EngineError::ItemActionDisabled {
                item_ref: item_ref.to_string(),
                action_id: String::new(),
                reason: "No item actions are available right now".to_string(),
            }),
            1 => Ok(enabled[0]),
            _ => Err(EngineError::AmbiguousItemAction {
                item_ref: item_ref.to_string(),
            }),
        }
    }

    fn apply_resolution(&mut self, resolution: &ChoiceResolution) -> Result<bool, EngineError> {
        match resolution {
            ChoiceResolution::Restart { start_node_id } => {
                self.state = self.fresh_state(start_node_id.clone());
                self.clear_gate_caches();
                Ok(true)
            }
            ChoiceResolution::Goto { node_id } => {
                let changed = self.state.current_node_id != *node_id;
                self.state.current_node_id = node_id.clone();
                if changed {
                    self.clear_gate_caches();
                }
                Ok(changed)
            }
            ChoiceResolution::GotoChapter {
                chapter_id,
                node_id,
            } => {
                let target = self.resolve_chapter_target(chapter_id, node_id.as_deref())?;
                let changed = self.state.current_node_id != target;
                self.state.current_node_id = target;
                if changed {
                    self.clear_gate_caches();
                }
                Ok(changed)
            }
            ChoiceResolution::Stay => Ok(false),
        }
    }

    fn resolve_chapter_target(
        &self,
        chapter_id: &str,
        node_id: Option<&str>,
    ) -> Result<String, EngineError> {
        let chapter = self
            .content
            .chapters
            .iter()
            .find(|chapter| chapter.id == chapter_id);
        let chapter = chapter.ok_or_else(|| {
            EngineError::ValidationError(format!("unknown chapter '{chapter_id}'"))
        })?;

        let target = match node_id {
            Some(node_id) => node_id.to_string(),
            None => chapter.start_node_id.clone(),
        };

        if !self.content.nodes.contains_key(&target) {
            return Err(EngineError::UnknownNode(target));
        }

        if let Some(owner) = self.content.node_chapter.get(&target)
            && owner != chapter_id
        {
            return Err(EngineError::ValidationError(format!(
                "node '{target}' belongs to chapter '{owner}', not '{chapter_id}'"
            )));
        }

        Ok(target)
    }

    fn chapter_id_for_node(&self, node_id: &str) -> Option<String> {
        self.content.node_chapter.get(node_id).cloned()
    }

    fn sync_ambient_background(&mut self) -> Result<(), EngineError> {
        let node_id = self.state.current_node_id.clone();
        let node = self.require_node(&node_id)?;
        if let Some(ref_id) = &node.background_ref {
            self.state.ambient_background = Some(ref_id.clone());
        }
        Ok(())
    }

    fn run_on_enter_effects(
        &mut self,
        rolls: &mut RollLog,
        side: &mut EffectSideEffects,
    ) -> Result<(), EngineError> {
        self.sync_ambient_background()?;
        let node_id = self.state.current_node_id.clone();
        let on_enter = self.require_node(&node_id)?.on_enter.clone();
        for effect in &on_enter {
            apply_effect(&mut self.state, effect, rolls, side)?;
        }
        Ok(())
    }

    fn apply_post_mutation_state(
        &mut self,
        rolls: &mut RollLog,
        side: &mut EffectSideEffects,
    ) -> Result<(), EngineError> {
        self.state.normalize();
        if self.maybe_redirect_to_death_node(rolls, side)? {
            self.state.normalize();
        }
        Ok(())
    }

    fn maybe_redirect_to_death_node(
        &mut self,
        rolls: &mut RollLog,
        side: &mut EffectSideEffects,
    ) -> Result<bool, EngineError> {
        let Some(death_node_id) = self.death_node_for_current_location() else {
            return Ok(false);
        };

        if !self.is_player_dead() {
            return Ok(false);
        }

        if self.state.current_node_id == death_node_id {
            return Ok(false);
        }

        if self
            .content
            .nodes
            .get(&self.state.current_node_id)
            .is_some_and(|node| node.mode.is_terminal())
        {
            return Ok(false);
        }

        logging::debug_fields_lazy("engine", "vitals failure redirect", || {
            serde_json::json!({
                "from": self.state.current_node_id,
                "to": death_node_id,
                "hp": self.state.player.stats.get("hp"),
            })
        });

        self.state.current_node_id = death_node_id;
        self.clear_gate_caches();
        self.run_on_enter_effects(rolls, side)?;
        Ok(true)
    }

    fn is_player_dead(&self) -> bool {
        self.state
            .player
            .stats
            .get("hp")
            .copied()
            .is_some_and(|hp| hp <= 0)
    }

    fn death_node_for_current_location(&self) -> Option<String> {
        if let Some(chapter_id) = self.content.node_chapter.get(&self.state.current_node_id)
            && let Some(chapter) = self
                .content
                .chapters
                .iter()
                .find(|chapter| &chapter.id == chapter_id)
            && let Some(death_node_id) = &chapter.death_node_id
        {
            return Some(death_node_id.clone());
        }

        self.content.death_node_id.clone()
    }

    fn mark_current_visited(&mut self) {
        let node_id = self.state.current_node_id.clone();
        self.state.mark_visited(&node_id);
    }

    fn resolve_choice<'a>(
        &self,
        node: &'a NodeContent,
        command: PlayerCommand,
    ) -> Result<(usize, &'a ChoiceContent), EngineError> {
        match command {
            PlayerCommand::Choose { choice_id } => node
                .choices
                .iter()
                .enumerate()
                .find(|(_, choice)| choice.presentation.id == choice_id)
                .ok_or(EngineError::UnknownChoice(choice_id)),
            PlayerCommand::Continue => node
                .choices
                .iter()
                .enumerate()
                .find(|(_, choice)| choice.presentation.id == "continue")
                .or_else(|| node.choices.first().map(|choice| (0, choice)))
                .ok_or_else(|| EngineError::UnknownChoice("continue".to_string())),
            PlayerCommand::Examine { .. } | PlayerCommand::UseItem { .. } => {
                Err(EngineError::ValidationError(
                    "internal error: non-choice command routed to choice handler".to_string(),
                ))
            }
        }
    }

    fn ensure_choice_enabled(
        &self,
        choice_index: usize,
        choice: &ChoiceContent,
    ) -> Result<(), EngineError> {
        let gate = self.gate_cache.get(choice_index).ok_or_else(|| {
            EngineError::ValidationError(format!(
                "gate cache missing choice '{}'",
                choice.presentation.id
            ))
        })?;

        if gate.enabled {
            Ok(())
        } else {
            Err(EngineError::ChoiceDisabled {
                choice_id: choice.presentation.id.clone(),
                reason: materialize_disabled_reason(gate)
                    .unwrap_or_else(|| "Choice is not available".to_string()),
            })
        }
    }

    fn fresh_state(&self, start_node_id: String) -> GameState {
        Self::fresh_state_from_content(&self.content, start_node_id)
    }

    fn fresh_state_from_content(content: &GameContent, start_node_id: String) -> GameState {
        GameState::new(
            start_node_id,
            content.revision.clone(),
            &content.default_stats,
            &content.default_relationships,
            content.random_seed.unwrap_or(DEFAULT_RANDOM_SEED),
        )
    }
}

fn command_summary(command: &PlayerCommand) -> String {
    match command {
        PlayerCommand::Choose { choice_id } => format!("choose choice_id={choice_id}"),
        PlayerCommand::Continue => "continue".to_string(),
        PlayerCommand::Examine { item_ref } => format!("examine item_ref={item_ref}"),
        PlayerCommand::UseItem {
            item_ref,
            action_id,
        } => match action_id {
            Some(action_id) => format!("useItem item_ref={item_ref} action_id={action_id}"),
            None => format!("useItem item_ref={item_ref}"),
        },
    }
}

fn resolution_summary(resolution: &ChoiceResolution) -> &'static str {
    match resolution {
        ChoiceResolution::Restart { .. } => "restart",
        ChoiceResolution::Goto { .. } => "goto",
        ChoiceResolution::GotoChapter { .. } => "gotoChapter",
        ChoiceResolution::Stay => "stay",
    }
}
