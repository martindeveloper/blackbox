//! Wire-format layer for the Blackbox narrative engine.
//!
//! Provides JSON and MessagePack encode/decode on top of the pure-logic
//! `blackbox` crate. Host applications depend on this crate, not on `blackbox`
//! directly, unless they only need engine types without format concerns.
//!
//! # Quick-start
//!
//! ```rust,ignore
//! use blackbox_format::{JsonFormat, MsgpackFormat, decode_scenario_bundle_json};
//!
//! // Load scenario bytes from disk (host responsibility)
//! let scenario_bytes = std::fs::read("scenario.json")?;
//! // ...
//!
//! // Decode + run engine
//! let engine = Engine::load_chaptered_bundle(scenario, items, characters, assets, chapters, &MsgpackFormat)?;
//! let view_json = engine.get_current_view().and_then(|v| JsonFormat.encode_view(&v))?;
//! ```

pub mod json;

pub use json::{
    ASSETS_BUNDLE_SPEC, CATALOG_SPEC, CHAPTER_SPEC, CHARACTERS_SPEC, ITEMS_SPEC, JsonFormat,
    LIBRARY_SPEC, MsgpackFormat, SCENARIO_SPEC, SUPPORTED_FORMAT_VERSION, ScenarioBundleManifest,
    ScenarioChapterManifest, decode_catalog_document, decode_library_document,
    decode_msgpack_bundle_bytes, decode_scenario_bundle_json, encode_assets_document,
    encode_catalog_document, encode_chapter_document, encode_characters_document,
    encode_items_document, encode_library_document, encode_scenario_document,
    merge_chapter_document, parse_chapter_documents, parse_scenario_manifest,
};
