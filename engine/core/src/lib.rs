//! Blackbox narrative engine — pure logic layer.
//!
//! The engine tracks game state and returns read-only [`GameView`] snapshots.
//! It does **not** perform I/O, render UI, or output audio.
//!
//! Scenario content and save data are format-agnostic domain types
//! ([`GameContent`], [`GameState`]). Wire formats live in `blackbox-format` and
//! implement [`ContentDecoder`] / [`StateCodec`]. Add a new codec there without
//! touching engine logic.
//!
//! Host applications (CLI harness, web player, iOS, Android) are responsible for:
//! - Loading raw scenario bytes from disk or network and passing them to
//!   `blackbox_format::decode_scenario_bundle_json`
//! - Playing music and SFX described by [`MusicCue`] / [`SfxCue`] in views
//! - Rendering text, choices, and handling player input

mod assets;
mod check;
mod choice_gate;
pub mod command;
mod compat;
mod compile;
mod condition;
pub mod content;
mod effect;
pub mod engine;
pub mod error;
pub mod expr;
pub mod format;
mod gate;
mod item_action;
pub mod logging;
mod relationship;
mod rng;
mod roll_log;
pub mod state;
mod text;
mod transition;
pub mod validation;
pub mod value;
pub mod view;

pub use assets::is_editor_sidecar_src;
pub use check::SkillCheckOverride;
pub use command::{CommandResult, PlayerCommand};
pub use condition::{Condition, actor_flag_key};
pub use content::{CharacterDefinition, ChoiceAction, GameContent, RollMode};
pub use engine::Engine;
pub use error::EngineError;
pub use format::{
    ContentDecoder, FormatId, GameFormat, StateCodec, encode_command_delta_json,
    encode_command_result_json, encode_view_json, encode_view_revision_mismatch_json,
    encode_view_snapshot_json,
};
pub use gate::Gate;
pub use logging::{LogFormatter, LogLevel, LogRecord, LogSink, StderrSink};
pub use relationship::{RelationshipScores, validate_relationship_metric};
pub use state::GameState;
pub use value::DynamicValue;
pub use view::{
    CharacterView, CheckPreview, GameView, InventoryItemView, ItemActionView, ItemExamineView,
    MusicCue, RelationshipCharacterView, RelationshipMetricView, RollRecord, SfxCue, TextureCue,
};
