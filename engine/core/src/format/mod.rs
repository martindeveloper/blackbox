//! Format traits and view-JSON encoding.
//!
//! Concrete format implementations (JSON / MessagePack wire types, encode/decode
//! functions, format structs) live in `blackbox-format`. This module keeps only:
//!
//! * The `ContentDecoder` / `StateCodec` / `GameFormat` traits that the engine
//!   accepts generically.
//! * `FormatId` — a lightweight discriminant callers can inspect.
//! * `view_json` — `Serialize` impls for core view types (must live here due to
//!   Rust's orphan rule) and the two public encode functions used by `JsonFormat`.

pub mod view_json;

use crate::content::GameContent;
use crate::error::EngineError;
use crate::state::GameState;

pub use view_json::{
    encode_command_delta_json, encode_command_result_json, encode_view_json,
    encode_view_revision_mismatch_json, encode_view_snapshot_json,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FormatId {
    Json,
    Msgpack,
}

impl FormatId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Json => "json",
            Self::Msgpack => "msgpack",
        }
    }
}

pub trait ContentDecoder {
    fn format_id(&self) -> FormatId;

    fn decode_bundle(
        &self,
        scenario: impl AsRef<[u8]>,
        items: impl AsRef<[u8]>,
        characters: impl AsRef<[u8]>,
        assets: impl AsRef<[u8]>,
    ) -> Result<GameContent, EngineError>;

    fn decode_chaptered_bundle(
        &self,
        scenario: impl AsRef<[u8]>,
        items: impl AsRef<[u8]>,
        characters: impl AsRef<[u8]>,
        assets: impl AsRef<[u8]>,
        chapters: Vec<impl AsRef<[u8]>>,
    ) -> Result<GameContent, EngineError> {
        let _ = chapters;
        self.decode_bundle(scenario, items, characters, assets)
    }

    fn merge_chapter_document(
        &self,
        _content: &mut GameContent,
        _chapter: impl AsRef<[u8]>,
    ) -> Result<(), EngineError> {
        Err(EngineError::ValidationError(
            "chapter merge is not supported for this content format".to_string(),
        ))
    }
}

pub trait StateCodec {
    fn format_id(&self) -> FormatId;

    fn encode_state(&self, state: &GameState) -> Result<Vec<u8>, EngineError>;

    fn decode_state(&self, input: impl AsRef<[u8]>) -> Result<GameState, EngineError>;
}

pub trait GameFormat: ContentDecoder + StateCodec {}

impl<T> GameFormat for T where T: ContentDecoder + StateCodec {}
