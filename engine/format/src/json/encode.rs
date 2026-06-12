use serde::Serialize;
use serde::de::DeserializeOwned;

use blackbox_engine::EngineError;

use super::wire::{
    AssetCatalogWire, ChapterWire, CharacterCatalogWire, DocumentWire, GameContentWire,
    ItemCatalogWire, LibraryWire, MetaCatalogWire,
};

/// Deserialize JSON → serialize msgpack. The shared pipeline for all content documents.
pub(crate) fn encode_document<T: DeserializeOwned + Serialize + DocumentWire>(
    bytes: &[u8],
    label: &str,
) -> Result<Vec<u8>, EngineError> {
    let document: T =
        serde_json::from_slice(bytes).map_err(|error| EngineError::ContentDecodeError {
            format: "json".to_string(),
            message: format!("{label}: {error}"),
        })?;
    rmp_serde::to_vec_named(&document).map_err(|error| EngineError::ContentDecodeError {
        format: "msgpack".to_string(),
        message: format!("{label}: {error}"),
    })
}

pub fn encode_scenario_document(bytes: &[u8]) -> Result<Vec<u8>, EngineError> {
    encode_document::<GameContentWire>(bytes, "scenario")
}

pub fn encode_items_document(bytes: &[u8]) -> Result<Vec<u8>, EngineError> {
    encode_document::<ItemCatalogWire>(bytes, "items")
}

pub fn encode_characters_document(bytes: &[u8]) -> Result<Vec<u8>, EngineError> {
    encode_document::<CharacterCatalogWire>(bytes, "characters")
}

pub fn encode_assets_document(bytes: &[u8]) -> Result<Vec<u8>, EngineError> {
    encode_document::<AssetCatalogWire>(bytes, "assets")
}

pub fn encode_chapter_document(bytes: &[u8]) -> Result<Vec<u8>, EngineError> {
    encode_document::<ChapterWire>(bytes, "chapter")
}

pub fn encode_catalog_document(bytes: &[u8]) -> Result<Vec<u8>, EngineError> {
    encode_document::<MetaCatalogWire>(bytes, "catalog")
}

pub fn encode_library_document(bytes: &[u8]) -> Result<Vec<u8>, EngineError> {
    encode_document::<LibraryWire>(bytes, "library")
}
