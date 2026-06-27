//! JSON serialization of view and command-result types.
//!
//! Implements `serde::Serialize` on core view types so the format crate can
//! call `serde_json::to_string(&view)` without violating the orphan rule
//! (the impl must live in the same crate as the type).
//!
use rustc_hash::FxHashMap as HashMap;
use std::sync::Arc;

use serde::ser::{SerializeMap, SerializeSeq, SerializeStruct};
use serde::{Serialize, Serializer};

use crate::command::CommandResult;
use crate::content::{ChoiceAction, DialogueSide, NodeMode, RollMode, TextBlock};
use crate::error::EngineError;
use crate::rng::DEFAULT_DIE_SIDES;
use crate::value::DynamicValue;
use crate::view::{
    CharacterView, CheckPreview, ChoiceView, GameView, InventoryItemView, ItemActionView,
    ItemExamineView, MusicCue, RelationshipCharacterView, RollRecord, SfxCue, TextureCue,
};

const VIEW_PROTOCOL_VERSION: u8 = 1;

pub fn encode_view_json(view: &GameView) -> Result<String, EngineError> {
    serde_json::to_string(view).map_err(|error| EngineError::HostEncodeError {
        format: "json".to_string(),
        message: error.to_string(),
    })
}

pub fn encode_command_result_json(result: &CommandResult) -> Result<String, EngineError> {
    let host = CommandResultHost::new(result);
    serde_json::to_string(&host).map_err(|error| EngineError::HostEncodeError {
        format: "json".to_string(),
        message: error.to_string(),
    })
}

pub fn encode_view_snapshot_json(view: &GameView, revision: u32) -> Result<String, EngineError> {
    serde_json::to_string(&ViewSnapshotHost {
        protocol: VIEW_PROTOCOL_VERSION,
        revision,
        view,
    })
    .map_err(|error| EngineError::HostEncodeError {
        format: "json".to_string(),
        message: error.to_string(),
    })
}

pub fn encode_command_delta_json(
    result: &CommandResult,
    previous_view: Option<&GameView>,
    base_revision: u32,
    revision: u32,
) -> Result<String, EngineError> {
    serde_json::to_string(&CommandDeltaHost {
        protocol: VIEW_PROTOCOL_VERSION,
        result,
        previous_view,
        base_revision,
        revision,
    })
    .map_err(|error| EngineError::HostEncodeError {
        format: "json".to_string(),
        message: error.to_string(),
    })
}

pub fn encode_view_revision_mismatch_json(
    expected: u32,
    received: u32,
) -> Result<String, EngineError> {
    serde_json::to_string(&ViewRevisionMismatchHost {
        protocol: VIEW_PROTOCOL_VERSION,
        ok: false,
        revision: expected,
        error: ViewRevisionMismatchError {
            error_type: "viewRevisionMismatch",
            expected,
            received,
        },
    })
    .map_err(|error| EngineError::HostEncodeError {
        format: "json".to_string(),
        message: error.to_string(),
    })
}

fn dynamic_value_to_json(value: &DynamicValue) -> serde_json::Value {
    match value {
        DynamicValue::Bool(b) => serde_json::Value::Bool(*b),
        DynamicValue::Number(n) => serde_json::Value::from(*n),
        DynamicValue::String(s) => serde_json::Value::String(s.clone()),
    }
}

fn skip_empty_rolls(rolls: &&[RollRecord]) -> bool {
    rolls.is_empty()
}

fn serialize_optional_arc_sfx<S: Serializer>(
    value: &Option<&Arc<SfxCue>>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    match value {
        None => serializer.serialize_none(),
        Some(cue) => cue.as_ref().serialize(serializer),
    }
}

#[derive(Serialize)]
struct CommandResultHost<'a> {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    view: Option<&'a GameView>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<&'a EngineError>,
    #[serde(
        default,
        rename = "selectedSfx",
        skip_serializing_if = "Option::is_none"
    )]
    #[serde(serialize_with = "serialize_optional_arc_sfx")]
    selected_sfx: Option<&'a Arc<SfxCue>>,
    #[serde(
        default,
        rename = "triggeredSfx",
        skip_serializing_if = "Option::is_none"
    )]
    #[serde(serialize_with = "serialize_optional_arc_sfx")]
    triggered_sfx: Option<&'a Arc<SfxCue>>,
    #[serde(default, skip_serializing_if = "skip_empty_rolls")]
    rolls: &'a [RollRecord],
    #[serde(skip_serializing_if = "Option::is_none")]
    examine: Option<&'a ItemExamineView>,
    #[serde(
        default,
        rename = "chapterChanged",
        skip_serializing_if = "skip_false_bool"
    )]
    chapter_changed: bool,
}

fn skip_false_bool(value: &bool) -> bool {
    !*value
}

#[derive(Serialize)]
struct ViewSnapshotHost<'a> {
    protocol: u8,
    revision: u32,
    view: &'a GameView,
}

#[derive(Serialize)]
struct ViewRevisionMismatchHost {
    protocol: u8,
    ok: bool,
    revision: u32,
    error: ViewRevisionMismatchError,
}

#[derive(Serialize)]
struct ViewRevisionMismatchError {
    #[serde(rename = "type")]
    error_type: &'static str,
    expected: u32,
    received: u32,
}

impl<'a> CommandResultHost<'a> {
    fn new(result: &'a CommandResult) -> Self {
        Self {
            ok: result.ok,
            view: result.view.as_ref(),
            error: result.error.as_ref(),
            selected_sfx: result.selected_sfx.as_ref(),
            triggered_sfx: result.triggered_sfx.as_ref(),
            rolls: &result.rolls,
            examine: result.examine.as_ref(),
            chapter_changed: result.chapter_changed,
        }
    }
}

struct CommandDeltaHost<'a> {
    protocol: u8,
    result: &'a CommandResult,
    previous_view: Option<&'a GameView>,
    base_revision: u32,
    revision: u32,
}

impl Serialize for CommandDeltaHost<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("CommandDelta", 10)?;
        state.serialize_field("protocol", &self.protocol)?;
        state.serialize_field("ok", &self.result.ok)?;
        state.serialize_field("revision", &self.revision)?;

        if let Some(error) = &self.result.error {
            state.serialize_field("error", error)?;
        }
        if let Some(selected_sfx) = &self.result.selected_sfx {
            state.serialize_field("selectedSfx", selected_sfx.as_ref())?;
        }
        if let Some(triggered_sfx) = &self.result.triggered_sfx {
            state.serialize_field("triggeredSfx", triggered_sfx.as_ref())?;
        }
        if !self.result.rolls.is_empty() {
            state.serialize_field("rolls", &self.result.rolls)?;
        }
        if let Some(examine) = &self.result.examine {
            state.serialize_field("examine", examine)?;
        }
        if self.result.chapter_changed {
            state.serialize_field("chapterChanged", &true)?;
        }

        if let Some(view) = &self.result.view {
            state.serialize_field("baseRevision", &self.base_revision)?;
            if let Some(previous_view) = self.previous_view {
                state.serialize_field(
                    "delta",
                    &GameViewDelta {
                        previous: previous_view,
                        current: view,
                    },
                )?;
            } else {
                state.serialize_field("snapshot", view)?;
            }
        }

        state.end()
    }
}

struct GameViewDelta<'a> {
    previous: &'a GameView,
    current: &'a GameView,
}

struct OptionalMusicCue<'a>(&'a Option<Arc<MusicCue>>);

impl Serialize for OptionalMusicCue<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self.0 {
            Some(cue) => cue.as_ref().serialize(serializer),
            None => serializer.serialize_none(),
        }
    }
}

struct OptionalTextureCue<'a>(&'a Option<Arc<TextureCue>>);

impl Serialize for OptionalTextureCue<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self.0 {
            Some(cue) => cue.as_ref().serialize(serializer),
            None => serializer.serialize_none(),
        }
    }
}

#[derive(Serialize)]
struct AppendedEvents<'a> {
    append: &'a [String],
}

#[derive(Serialize)]
struct ReplacedEvents<'a> {
    replace: &'a [String],
}

fn text_blocks_equal(left: &[TextBlock], right: &[TextBlock]) -> bool {
    left.len() == right.len()
        && left
            .iter()
            .zip(right)
            .all(|(left, right)| text_block_equal(left, right))
}

fn text_block_equal(left: &TextBlock, right: &TextBlock) -> bool {
    left.kind == right.kind
        && left.text == right.text
        && left.speaker == right.speaker
        && left.emotion == right.emotion
        && left.side == right.side
}

struct TextDelta<'a> {
    previous: &'a [TextBlock],
    current: &'a [TextBlock],
}

impl Serialize for TextDelta<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let changed_count = self
            .current
            .iter()
            .enumerate()
            .filter(|(index, current)| text_block_changed(self.previous, *index, current))
            .count();
        let use_sparse = changed_count.saturating_mul(2) <= self.current.len();
        let mut state = serializer.serialize_struct("TextDelta", 2)?;
        if use_sparse {
            state.serialize_field("length", &self.current.len())?;
            state.serialize_field(
                "set",
                &ChangedTextBlocks {
                    previous: self.previous,
                    current: self.current,
                    changed_count,
                },
            )?;
        } else {
            state.serialize_field("replace", self.current)?;
        }
        state.end()
    }
}

struct ChangedTextBlocks<'a> {
    previous: &'a [TextBlock],
    current: &'a [TextBlock],
    changed_count: usize,
}

#[derive(Serialize)]
struct ChangedTextBlock<'a> {
    index: usize,
    value: &'a TextBlock,
}

fn text_block_changed(previous: &[TextBlock], index: usize, current: &TextBlock) -> bool {
    match previous.get(index) {
        Some(previous) => !text_block_equal(previous, current),
        None => true,
    }
}

impl Serialize for ChangedTextBlocks<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut sequence = serializer.serialize_seq(Some(self.changed_count))?;
        for (index, current) in self.current.iter().enumerate() {
            if text_block_changed(self.previous, index, current) {
                sequence.serialize_element(&ChangedTextBlock {
                    index,
                    value: current,
                })?;
            }
        }
        sequence.end()
    }
}

fn choices_equal(left: &[ChoiceView], right: &[ChoiceView]) -> bool {
    left.len() == right.len()
        && left.iter().zip(right).all(|(left, right)| {
            left.id == right.id
                && left.label == right.label
                && left.enabled == right.enabled
                && left.disabled_reason == right.disabled_reason
                && left.check == right.check
                && left.action == right.action
                && left.sfx == right.sfx
        })
}

impl Serialize for GameViewDelta<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let previous = self.previous;
        let current = self.current;
        let mut state = serializer.serialize_map(None)?;

        if previous.scenario_title != current.scenario_title {
            state.serialize_entry("scenarioTitle", &current.scenario_title)?;
        }
        if previous.chapter_id != current.chapter_id {
            state.serialize_entry("chapterId", &current.chapter_id)?;
        }
        if previous.chapter_title != current.chapter_title {
            state.serialize_entry("chapterTitle", &current.chapter_title)?;
        }
        if previous.node_id != current.node_id {
            state.serialize_entry("node_id", &current.node_id)?;
        }
        if previous.title != current.title {
            state.serialize_entry("title", &current.title)?;
        }
        if previous.mode != current.mode {
            state.serialize_entry("mode", &current.mode)?;
        }
        if !text_blocks_equal(&previous.text, &current.text) {
            state.serialize_entry(
                "text",
                &TextDelta {
                    previous: &previous.text,
                    current: &current.text,
                },
            )?;
        }
        if !choices_equal(&previous.choices, &current.choices) {
            state.serialize_entry("choices", &current.choices)?;
        }
        if previous.music != current.music {
            state.serialize_entry("music", &OptionalMusicCue(&current.music))?;
        }
        if previous.background != current.background {
            state.serialize_entry("background", &OptionalTextureCue(&current.background))?;
        }
        if previous.inventory_items != current.inventory_items {
            state.serialize_entry("inventory_items", &current.inventory_items)?;
        }
        if previous.item_actions != current.item_actions {
            state.serialize_entry("item_actions", &current.item_actions)?;
        }
        if previous.characters != current.characters {
            state.serialize_entry("characters", &current.characters)?;
        }
        if previous.relationships != current.relationships {
            state.serialize_entry("relationships", &current.relationships)?;
        }
        if previous.player_stats != current.player_stats {
            state.serialize_entry("player_stats", &current.player_stats)?;
        }
        if previous.inventory != current.inventory {
            state.serialize_entry("inventory", &current.inventory)?;
        }
        if previous.flags != current.flags {
            state.serialize_entry("flags", &HostFlags(&current.flags))?;
        }
        if previous.events != current.events {
            if current.events.starts_with(&previous.events) {
                state.serialize_entry(
                    "events",
                    &AppendedEvents {
                        append: &current.events[previous.events.len()..],
                    },
                )?;
            } else {
                state.serialize_entry(
                    "events",
                    &ReplacedEvents {
                        replace: &current.events,
                    },
                )?;
            }
        }

        state.end()
    }
}

impl Serialize for GameView {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("GameView", 18)?;
        if let Some(value) = &self.scenario_title {
            state.serialize_field("scenarioTitle", value)?;
        }
        if let Some(value) = &self.chapter_id {
            state.serialize_field("chapterId", value)?;
        }
        if let Some(value) = &self.chapter_title {
            state.serialize_field("chapterTitle", value)?;
        }
        state.serialize_field("node_id", &self.node_id)?;
        if let Some(value) = &self.title {
            state.serialize_field("title", value)?;
        }
        state.serialize_field("mode", &self.mode)?;
        state.serialize_field("text", &self.text)?;
        state.serialize_field("choices", &self.choices)?;
        if let Some(value) = &self.music {
            state.serialize_field("music", value.as_ref())?;
        }
        if let Some(value) = &self.background {
            state.serialize_field("background", value.as_ref())?;
        }
        state.serialize_field("inventory_items", &self.inventory_items)?;
        state.serialize_field("item_actions", &self.item_actions)?;
        state.serialize_field("characters", &self.characters)?;
        state.serialize_field("relationships", &self.relationships)?;
        state.serialize_field("player_stats", &self.player_stats)?;
        state.serialize_field("inventory", &self.inventory)?;
        state.serialize_field("flags", &HostFlags(&self.flags))?;
        state.serialize_field("events", &self.events)?;
        state.serialize_field("meta", self.meta.as_ref())?;
        state.end()
    }
}

struct HostFlags<'a>(&'a HashMap<String, DynamicValue>);

impl Serialize for HostFlags<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (key, value) in self.0 {
            map.serialize_entry(key, &dynamic_value_to_json(value))?;
        }
        map.end()
    }
}

impl Serialize for NodeMode {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            NodeMode::Normal => serializer.serialize_str("normal"),
            NodeMode::GameOver => serializer.serialize_str("game_over"),
            NodeMode::Ending => serializer.serialize_str("ending"),
        }
    }
}

impl Serialize for TextBlock {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("TextBlock", 6)?;
        state.serialize_field("kind", &self.kind)?;
        state.serialize_field("text", &self.text)?;
        if let Some(value) = &self.speaker {
            state.serialize_field("speaker", value)?;
        }
        if let Some(value) = &self.emotion {
            state.serialize_field("emotion", value)?;
        }
        if let Some(value) = &self.side {
            state.serialize_field("side", value)?;
        }
        state.end()
    }
}

impl Serialize for DialogueSide {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            DialogueSide::Left => serializer.serialize_str("left"),
            DialogueSide::Right => serializer.serialize_str("right"),
            DialogueSide::Center => serializer.serialize_str("center"),
        }
    }
}

impl Serialize for MusicCue {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("MusicCue", 3)?;
        state.serialize_field("ref_id", &self.ref_id)?;
        state.serialize_field("src", &self.src)?;
        state.serialize_field("loop", &self.r#loop)?;
        state.end()
    }
}

impl Serialize for SfxCue {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("SfxCue", 2)?;
        state.serialize_field("ref_id", &self.ref_id)?;
        state.serialize_field("src", &self.src)?;
        state.end()
    }
}

impl Serialize for TextureCue {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("TextureCue", 2)?;
        state.serialize_field("ref_id", &self.ref_id)?;
        state.serialize_field("src", &self.src)?;
        state.end()
    }
}

impl Serialize for CharacterView {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("CharacterView", 7)?;
        state.serialize_field("ref_id", &self.ref_id)?;
        state.serialize_field("name", &self.name)?;
        if let Some(value) = &self.subtitle {
            state.serialize_field("subtitle", value)?;
        }
        if let Some(value) = &self.portrait {
            state.serialize_field("portrait", value.as_ref())?;
        }
        if let Some(value) = &self.voice_ref {
            state.serialize_field("voiceRef", value)?;
        }
        if let Some(value) = &self.color {
            state.serialize_field("color", value)?;
        }
        state.serialize_field("metrics", &CharacterMetricsHost(&self.metrics))?;
        state.end()
    }
}

impl Serialize for RelationshipCharacterView {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("RelationshipCharacterView", 5)?;
        state.serialize_field("ref_id", &self.ref_id)?;
        state.serialize_field("name", &self.name)?;
        if let Some(value) = &self.subtitle {
            state.serialize_field("subtitle", value)?;
        }
        if let Some(value) = &self.color {
            state.serialize_field("color", value)?;
        }
        state.serialize_field("metrics", &CharacterMetricsHost(&self.metrics))?;
        state.end()
    }
}

struct CharacterMetricsHost<'a>(&'a [crate::view::RelationshipMetricView]);

impl Serialize for CharacterMetricsHost<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut seq = serializer.serialize_seq(Some(self.0.len()))?;
        for metric in self.0 {
            seq.serialize_element(&CharacterMetricHost(metric))?;
        }
        seq.end()
    }
}

struct CharacterMetricHost<'a>(&'a crate::view::RelationshipMetricView);

impl Serialize for CharacterMetricHost<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("RelationshipMetricView", 2)?;
        state.serialize_field("key", &self.0.key)?;
        state.serialize_field("value", &self.0.value)?;
        state.end()
    }
}

impl Serialize for InventoryItemView {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("InventoryItemView", 4)?;
        state.serialize_field("ref_id", &self.ref_id)?;
        state.serialize_field("name", &self.name)?;
        state.serialize_field("count", &self.count)?;
        if let Some(value) = &self.icon {
            state.serialize_field("icon", value.as_ref())?;
        }
        state.end()
    }
}

impl Serialize for ItemActionView {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("ItemActionView", 5)?;
        state.serialize_field("item_ref", &self.item_ref)?;
        state.serialize_field("action_id", &self.action_id)?;
        state.serialize_field("label", &self.label)?;
        state.serialize_field("enabled", &self.enabled)?;
        if let Some(value) = &self.disabled_reason {
            state.serialize_field("disabledReason", value)?;
        }
        state.end()
    }
}

impl Serialize for ItemExamineView {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("ItemExamineView", 5)?;
        state.serialize_field("ref_id", &self.ref_id)?;
        state.serialize_field("name", &self.name)?;
        state.serialize_field("description", &self.description)?;
        state.serialize_field("examine_text", &self.examine_text)?;
        if let Some(value) = &self.icon {
            state.serialize_field("icon", value.as_ref())?;
        }
        state.end()
    }
}

impl Serialize for RollMode {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            RollMode::Normal => serializer.serialize_str("normal"),
            RollMode::Advantage => serializer.serialize_str("advantage"),
            RollMode::Disadvantage => serializer.serialize_str("disadvantage"),
        }
    }
}

impl Serialize for CheckPreview {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("CheckPreview", 7)?;
        state.serialize_field("stat", &self.stat)?;
        state.serialize_field("difficulty", &self.difficulty)?;
        if let Some(value) = &self.label {
            state.serialize_field("label", value)?;
        }
        if self.sides != DEFAULT_DIE_SIDES {
            state.serialize_field("sides", &self.sides)?;
        }
        if self.roll_mode != RollMode::Normal {
            state.serialize_field("rollMode", &self.roll_mode)?;
        }
        if let Some(value) = self.max_attempts {
            state.serialize_field("maxAttempts", &value)?;
            state.serialize_field("attemptsUsed", &self.attempts_used)?;
        }
        state.end()
    }
}

impl Serialize for ChoiceView {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("ChoiceView", 7)?;
        state.serialize_field("id", &self.id)?;
        state.serialize_field("label", &self.label)?;
        state.serialize_field("enabled", &self.enabled)?;
        if let Some(value) = &self.disabled_reason {
            state.serialize_field("disabledReason", value)?;
        }
        if let Some(value) = &self.check {
            state.serialize_field("check", value)?;
        }
        if let Some(value) = &self.action {
            state.serialize_field("action", value)?;
        }
        if let Some(value) = &self.sfx {
            state.serialize_field("sfx", value.as_ref())?;
        }
        state.end()
    }
}

impl Serialize for ChoiceAction {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            ChoiceAction::RestartGame { start_node_id } => {
                let mut state = serializer.serialize_struct("RestartGame", 2)?;
                state.serialize_field("type", "restartGame")?;
                state.serialize_field("startNodeId", start_node_id)?;
                state.end()
            }
            ChoiceAction::OpenLoadMenu => {
                let mut state = serializer.serialize_struct("OpenLoadMenu", 1)?;
                state.serialize_field("type", "openLoadMenu")?;
                state.end()
            }
            ChoiceAction::OpenMainMenu => {
                let mut state = serializer.serialize_struct("OpenMainMenu", 1)?;
                state.serialize_field("type", "openMainMenu")?;
                state.end()
            }
            ChoiceAction::GotoChapter {
                chapter_id,
                node_id,
            } => {
                let mut state = serializer.serialize_struct("GotoChapter", 3)?;
                state.serialize_field("type", "gotoChapter")?;
                state.serialize_field("chapterId", chapter_id)?;
                if let Some(value) = node_id {
                    state.serialize_field("nodeId", value)?;
                }
                state.end()
            }
        }
    }
}

impl Serialize for RollRecord {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            RollRecord::SkillCheck {
                label,
                stat,
                difficulty,
                sides,
                roll,
                modifier,
                total,
                success,
                roll_mode,
            } => {
                let mut state = serializer.serialize_struct("SkillCheck", 10)?;
                state.serialize_field("kind", "skillCheck")?;
                if let Some(value) = label {
                    state.serialize_field("label", value)?;
                }
                state.serialize_field("stat", stat)?;
                state.serialize_field("difficulty", difficulty)?;
                if let Some(value) = sides {
                    state.serialize_field("sides", value)?;
                }
                state.serialize_field("roll", roll)?;
                state.serialize_field("modifier", modifier)?;
                state.serialize_field("total", total)?;
                state.serialize_field("success", success)?;
                if *roll_mode != RollMode::Normal {
                    state.serialize_field("rollMode", roll_mode)?;
                }
                state.end()
            }
            RollRecord::Roll {
                label,
                sides,
                roll,
                modifier,
                total,
            } => {
                let mut state = serializer.serialize_struct("Roll", 6)?;
                state.serialize_field("kind", "roll")?;
                if let Some(value) = label {
                    state.serialize_field("label", value)?;
                }
                if let Some(value) = sides {
                    state.serialize_field("sides", value)?;
                }
                state.serialize_field("roll", roll)?;
                state.serialize_field("modifier", modifier)?;
                state.serialize_field("total", total)?;
                state.end()
            }
            RollRecord::Random {
                label,
                sides,
                roll,
                modifier,
                total,
            } => {
                let mut state = serializer.serialize_struct("Random", 6)?;
                state.serialize_field("kind", "random")?;
                if let Some(value) = label {
                    state.serialize_field("label", value)?;
                }
                if let Some(value) = sides {
                    state.serialize_field("sides", value)?;
                }
                state.serialize_field("roll", roll)?;
                state.serialize_field("modifier", modifier)?;
                state.serialize_field("total", total)?;
                state.end()
            }
            RollRecord::Dice {
                label,
                sides,
                roll,
                modifier,
                total,
            } => {
                let mut state = serializer.serialize_struct("Dice", 6)?;
                state.serialize_field("kind", "dice")?;
                if let Some(value) = label {
                    state.serialize_field("label", value)?;
                }
                if let Some(value) = sides {
                    state.serialize_field("sides", value)?;
                }
                state.serialize_field("roll", roll)?;
                state.serialize_field("modifier", modifier)?;
                state.serialize_field("total", total)?;
                state.end()
            }
        }
    }
}

impl Serialize for EngineError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        engine_error_wire(self).serialize(serializer)
    }
}

// Minimal wire repr for EngineError — full mapping lives in blackbox_format.
#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum EngineErrorWire {
    ContentDecodeError {
        format: String,
        message: String,
    },
    StateEncodeError {
        format: String,
        message: String,
    },
    StateDecodeError {
        format: String,
        message: String,
    },
    HostEncodeError {
        format: String,
        message: String,
    },
    HostDecodeError {
        format: String,
        message: String,
    },
    UnknownNode {
        #[serde(rename = "0")]
        id: String,
    },
    UnknownChoice {
        #[serde(rename = "0")]
        id: String,
    },
    ChoiceDisabled {
        choice_id: String,
        reason: String,
    },
    ExpressionError {
        #[serde(rename = "0")]
        detail: String,
    },
    ValidationError {
        #[serde(rename = "0")]
        detail: String,
    },
    RevisionMismatch {
        save: String,
        current: String,
    },
    UnknownItem {
        #[serde(rename = "0")]
        id: String,
    },
    ItemNotOwned {
        #[serde(rename = "itemRef")]
        item_ref: String,
    },
    UnknownItemAction {
        #[serde(rename = "itemRef")]
        item_ref: String,
        #[serde(rename = "actionId")]
        action_id: String,
    },
    ItemActionDisabled {
        #[serde(rename = "itemRef")]
        item_ref: String,
        #[serde(rename = "actionId")]
        action_id: String,
        reason: String,
    },
    AmbiguousItemAction {
        #[serde(rename = "itemRef")]
        item_ref: String,
    },
}

fn engine_error_wire(error: &EngineError) -> EngineErrorWire {
    match error {
        EngineError::ContentDecodeError { format, message } => {
            EngineErrorWire::ContentDecodeError {
                format: format.clone(),
                message: message.clone(),
            }
        }
        EngineError::StateEncodeError { format, message } => EngineErrorWire::StateEncodeError {
            format: format.clone(),
            message: message.clone(),
        },
        EngineError::StateDecodeError { format, message } => EngineErrorWire::StateDecodeError {
            format: format.clone(),
            message: message.clone(),
        },
        EngineError::HostEncodeError { format, message } => EngineErrorWire::HostEncodeError {
            format: format.clone(),
            message: message.clone(),
        },
        EngineError::HostDecodeError { format, message } => EngineErrorWire::HostDecodeError {
            format: format.clone(),
            message: message.clone(),
        },
        EngineError::UnknownNode(id) => EngineErrorWire::UnknownNode { id: id.clone() },
        EngineError::UnknownChoice(id) => EngineErrorWire::UnknownChoice { id: id.clone() },
        EngineError::ChoiceDisabled { choice_id, reason } => EngineErrorWire::ChoiceDisabled {
            choice_id: choice_id.clone(),
            reason: reason.clone(),
        },
        EngineError::ExpressionError(message) => EngineErrorWire::ExpressionError {
            detail: message.clone(),
        },
        EngineError::ValidationError(message) => EngineErrorWire::ValidationError {
            detail: message.clone(),
        },
        EngineError::RevisionMismatch { save, current } => EngineErrorWire::RevisionMismatch {
            save: save.clone(),
            current: current.clone(),
        },
        EngineError::UnknownItem(item_ref) => EngineErrorWire::UnknownItem {
            id: item_ref.clone(),
        },
        EngineError::ItemNotOwned { item_ref } => EngineErrorWire::ItemNotOwned {
            item_ref: item_ref.clone(),
        },
        EngineError::UnknownItemAction {
            item_ref,
            action_id,
        } => EngineErrorWire::UnknownItemAction {
            item_ref: item_ref.clone(),
            action_id: action_id.clone(),
        },
        EngineError::ItemActionDisabled {
            item_ref,
            action_id,
            reason,
        } => EngineErrorWire::ItemActionDisabled {
            item_ref: item_ref.clone(),
            action_id: action_id.clone(),
            reason: reason.clone(),
        },
        EngineError::AmbiguousItemAction { item_ref } => EngineErrorWire::AmbiguousItemAction {
            item_ref: item_ref.clone(),
        },
    }
}
