mod bundle;
mod convert;
mod decode;
mod encode;
mod host;
mod resolve;
mod wire;
pub mod wire_schema;

pub use bundle::{
    ScenarioBundleManifest, ScenarioChapterManifest, decode_scenario_bundle_json,
    parse_chapter_documents, parse_scenario_manifest,
};
pub use convert::merge_chapter_document;
pub use decode::{decode_catalog_document, decode_library_document, decode_msgpack_bundle_bytes};
pub use encode::{
    encode_assets_document, encode_catalog_document, encode_chapter_document,
    encode_characters_document, encode_items_document, encode_library_document,
    encode_scenario_document,
};
pub use wire_schema::{
    ASSETS_BUNDLE_SPEC, CATALOG_SPEC, CHAPTER_SPEC, CHARACTERS_SPEC, ITEMS_SPEC, LIBRARY_SPEC,
    SCENARIO_SPEC, SUPPORTED_FORMAT_VERSION,
};

use blackbox_engine::command::{CommandResult, PlayerCommand};
use blackbox_engine::content::GameContent;
use blackbox_engine::format::{ContentDecoder, FormatId, StateCodec};
use blackbox_engine::logging::{self, LogLevel};
use blackbox_engine::state::GameState;
use blackbox_engine::view::GameView;
use blackbox_engine::{EngineError, encode_command_result_json, encode_view_json};

use convert::{state_from_wire, state_to_wire};
use host::{PlayerCommandWire, command_from_wire};
use wire::GameStateWire;

#[derive(Debug, Clone, Copy, Default)]
pub struct MsgpackFormat;

impl MsgpackFormat {
    const ID: FormatId = FormatId::Msgpack;
}

impl ContentDecoder for MsgpackFormat {
    fn format_id(&self) -> FormatId {
        Self::ID
    }

    fn decode_bundle(
        &self,
        scenario: impl AsRef<[u8]>,
        items: impl AsRef<[u8]>,
        characters: impl AsRef<[u8]>,
        assets: impl AsRef<[u8]>,
    ) -> Result<GameContent, EngineError> {
        decode_msgpack_bundle_bytes(
            scenario,
            items,
            characters,
            assets,
            Vec::<&[u8]>::new(),
            None::<&[u8]>,
        )
    }

    fn decode_chaptered_bundle(
        &self,
        scenario: impl AsRef<[u8]>,
        items: impl AsRef<[u8]>,
        characters: impl AsRef<[u8]>,
        assets: impl AsRef<[u8]>,
        chapters: Vec<impl AsRef<[u8]>>,
    ) -> Result<GameContent, EngineError> {
        decode_msgpack_bundle_bytes(scenario, items, characters, assets, chapters, None::<&[u8]>)
    }

    fn merge_chapter_document(
        &self,
        content: &mut GameContent,
        chapter: impl AsRef<[u8]>,
    ) -> Result<(), EngineError> {
        merge_chapter_document(content, chapter)
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct JsonFormat;

impl JsonFormat {
    const ID: FormatId = FormatId::Json;

    pub fn decode_bundle_str(
        &self,
        scenario: &str,
        items: &str,
        characters: &str,
        assets: &str,
    ) -> Result<GameContent, EngineError> {
        self.decode_bundle(
            scenario.as_bytes(),
            items.as_bytes(),
            characters.as_bytes(),
            assets.as_bytes(),
        )
    }

    pub fn encode_state_utf8(&self, state: &GameState) -> Result<String, EngineError> {
        let bytes = self.encode_state(state)?;
        String::from_utf8(bytes).map_err(|error| EngineError::StateEncodeError {
            format: Self::ID.as_str().to_string(),
            message: error.to_string(),
        })
    }

    pub fn decode_state_utf8(&self, input: &str) -> Result<GameState, EngineError> {
        self.decode_state(input.as_bytes())
    }

    pub fn encode_view(&self, view: &GameView) -> Result<String, EngineError> {
        logging::debug_fields_lazy("json", "encode_view", || {
            serde_json::json!({
                "node_id": view.node_id,
                "choice_count": view.choices.len(),
            })
        });
        encode_view_json(view).inspect_err(|error| {
            logging::log_with_fields(
                LogLevel::Error,
                "json",
                "encode_view failed",
                Some(serde_json::json!({
                    "node_id": view.node_id,
                    "error": error.to_string(),
                })),
            );
        })
    }

    pub fn decode_command(&self, input: &str) -> Result<PlayerCommand, EngineError> {
        logging::debug_fields_lazy("json", "decode_command", || {
            serde_json::json!({
                "input_len": input.len(),
                "input_trimmed_len": input.trim().len(),
                "input_empty": input.is_empty(),
                "input_preview": preview_host_payload(input),
            })
        });
        let wire: PlayerCommandWire = serde_json::from_str(input).map_err(|error| {
            let message = error.to_string();
            logging::log_with_fields(
                LogLevel::Error,
                "json",
                "decode_command failed",
                Some(serde_json::json!({
                    "input_len": input.len(),
                    "input_trimmed_len": input.trim().len(),
                    "input_empty": input.is_empty(),
                    "input_preview": preview_host_payload(input),
                    "error": message,
                })),
            );
            EngineError::HostDecodeError {
                format: Self::ID.as_str().to_string(),
                message,
            }
        })?;
        let command = command_from_wire(wire);
        logging::debug("json", format!("decode_command ok: {command:?}"));
        Ok(command)
    }

    pub fn encode_command_result(&self, result: &CommandResult) -> Result<String, EngineError> {
        logging::debug_fields_lazy("json", "encode_command_result", || {
            serde_json::json!({
                "ok": result.ok,
                "has_view": result.view.is_some(),
                "view_node_id": result.view.as_ref().map(|view| view.node_id.clone()),
                "error": result.error.as_ref().map(|error| error.to_string()),
                "roll_count": result.rolls.len(),
                "chapter_changed": result.chapter_changed,
            })
        });
        encode_command_result_json(result).inspect_err(|error| {
            logging::log_with_fields(
                LogLevel::Error,
                "json",
                "encode_command_result failed",
                Some(serde_json::json!({
                    "ok": result.ok,
                    "error": error.to_string(),
                })),
            );
        })
    }
}

fn preview_host_payload(input: &str) -> String {
    const MAX_CHARS: usize = 240;
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return if input.is_empty() {
            "<empty>".to_string()
        } else {
            format!("<whitespace only, len={}>", input.len())
        };
    }
    let mut preview = trimmed.chars().take(MAX_CHARS).collect::<String>();
    if trimmed.chars().count() > MAX_CHARS {
        preview.push('…');
    }
    preview
}

impl ContentDecoder for JsonFormat {
    fn format_id(&self) -> FormatId {
        Self::ID
    }

    fn decode_bundle(
        &self,
        scenario: impl AsRef<[u8]>,
        items: impl AsRef<[u8]>,
        characters: impl AsRef<[u8]>,
        assets: impl AsRef<[u8]>,
    ) -> Result<GameContent, EngineError> {
        decode_scenario_bundle_json(
            scenario,
            items,
            characters,
            assets,
            None::<&[u8]>,
            None::<&[u8]>,
            Vec::<&[u8]>::new(),
        )
    }

    fn decode_chaptered_bundle(
        &self,
        scenario: impl AsRef<[u8]>,
        items: impl AsRef<[u8]>,
        characters: impl AsRef<[u8]>,
        assets: impl AsRef<[u8]>,
        chapters: Vec<impl AsRef<[u8]>>,
    ) -> Result<GameContent, EngineError> {
        decode_scenario_bundle_json(
            scenario,
            items,
            characters,
            assets,
            None::<&[u8]>,
            None::<&[u8]>,
            chapters,
        )
    }
}

impl StateCodec for JsonFormat {
    fn format_id(&self) -> FormatId {
        Self::ID
    }

    fn encode_state(&self, state: &GameState) -> Result<Vec<u8>, EngineError> {
        let wire = state_to_wire(state);
        serde_json::to_vec_pretty(&wire).map_err(|error| EngineError::StateEncodeError {
            format: Self::ID.as_str().to_string(),
            message: error.to_string(),
        })
    }

    fn decode_state(&self, input: impl AsRef<[u8]>) -> Result<GameState, EngineError> {
        let wire: GameStateWire = serde_json::from_slice(input.as_ref()).map_err(|error| {
            EngineError::StateDecodeError {
                format: Self::ID.as_str().to_string(),
                message: error.to_string(),
            }
        })?;
        state_from_wire(wire)
    }
}
