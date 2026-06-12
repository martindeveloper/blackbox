use serde::de::DeserializeOwned;

use blackbox_engine::EngineError;
use blackbox_engine::content::{GameContent, MetaCatalog};
use blackbox_engine::logging;

use super::convert::{LibraryWireContext, bundle_from_wire, meta_catalog_from_wire};
use super::resolve::decode_library_bytes;
use super::wire::{
    AssetCatalogWire, ChapterWire, CharacterCatalogWire, DocumentWire, GameContentWire,
    ItemCatalogWire, MetaCatalogWire,
};
use super::wire_schema::{
    ASSETS_BUNDLE_SPEC, CATALOG_SPEC, CHAPTER_SPEC, CHARACTERS_SPEC, ITEMS_SPEC, SCENARIO_SPEC,
    validate_document_envelope,
};

/// Deserialize JSON document bytes (authoring / bundler path).
pub(crate) fn decode_json_document<T: DeserializeOwned>(
    bytes: &[u8],
    label: &str,
) -> Result<T, EngineError> {
    serde_json::from_slice(bytes).map_err(|error| EngineError::ContentDecodeError {
        format: "json".to_string(),
        message: format!("{label}: {error}"),
    })
}

/// Deserialize msgpack + validate spec envelope. The shared decode pipeline.
pub(crate) fn decode_document<T: DeserializeOwned + DocumentWire>(
    bytes: &[u8],
    label: &str,
    expected_spec: &str,
) -> Result<T, EngineError> {
    let wire: T = rmp_serde::from_slice(bytes).map_err(|e| EngineError::ContentDecodeError {
        format: "msgpack".to_string(),
        message: format!("{label}: {e}"),
    })?;
    validate_document_envelope(
        label,
        wire.document_spec(),
        expected_spec,
        wire.document_format_version(),
    )?;
    Ok(wire)
}

pub fn decode_catalog_document(bytes: impl AsRef<[u8]>) -> Result<MetaCatalog, EngineError> {
    let wire = decode_document::<MetaCatalogWire>(bytes.as_ref(), "catalog", CATALOG_SPEC)?;
    Ok(meta_catalog_from_wire(wire))
}

pub fn decode_library_document(bytes: impl AsRef<[u8]>) -> Result<(), EngineError> {
    decode_library_bytes(bytes.as_ref())?;
    Ok(())
}

pub fn decode_msgpack_bundle_bytes(
    scenario: impl AsRef<[u8]>,
    items: impl AsRef<[u8]>,
    characters: impl AsRef<[u8]>,
    assets: impl AsRef<[u8]>,
    chapters: Vec<impl AsRef<[u8]>>,
    library: Option<impl AsRef<[u8]>>,
) -> Result<GameContent, EngineError> {
    let scenario =
        decode_document::<GameContentWire>(scenario.as_ref(), "scenario", SCENARIO_SPEC)?;
    let items = decode_document::<ItemCatalogWire>(items.as_ref(), "items", ITEMS_SPEC)?;
    let characters = decode_document::<CharacterCatalogWire>(
        characters.as_ref(),
        "characters",
        CHARACTERS_SPEC,
    )?;
    let assets =
        decode_document::<AssetCatalogWire>(assets.as_ref(), "assets", ASSETS_BUNDLE_SPEC)?;

    let loaded_chapters = chapters
        .iter()
        .enumerate()
        .map(|(index, bytes)| {
            decode_document::<ChapterWire>(
                bytes.as_ref(),
                &format!("chapter[{index}]"),
                CHAPTER_SPEC,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;

    let prepared_library = match &library {
        Some(bytes) => Some(decode_library_bytes(bytes.as_ref())?),
        None => None,
    };
    let library_source = library.map(|bytes| bytes.as_ref().to_vec());

    let content = bundle_from_wire(
        scenario,
        items,
        characters,
        assets,
        MetaCatalogWire::default(),
        LibraryWireContext {
            prepared: prepared_library,
            source: library_source,
        },
        loaded_chapters,
    )?;
    logging::debug_fields(
        "engine",
        "msgpack bundle assembled",
        serde_json::json!({
            "title": content.title,
            "revision": content.revision,
            "chapters": content.chapters.len(),
            "nodes": content.nodes.len(),
            "items": content.items.items.len(),
            "characters": content.characters.characters.len(),
        }),
    );
    Ok(content)
}
