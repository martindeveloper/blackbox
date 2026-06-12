use blackbox_engine::EngineError;
use blackbox_engine::content::GameContent;
use blackbox_engine::logging;

use super::convert::{LibraryWireContext, bundle_from_wire, chapters_from_wire_bytes};
use super::decode::decode_json_document;
use super::resolve::decode_library_bytes;
use super::wire::{
    AssetCatalogWire, CharacterCatalogWire, GameContentWire, ItemCatalogWire, MetaCatalogWire,
};
use super::wire_schema::{
    ASSETS_BUNDLE_SPEC, CATALOG_SPEC, CHARACTERS_SPEC, ITEMS_SPEC, SCENARIO_SPEC,
    validate_document_envelope,
};

fn decode_document<T: serde::de::DeserializeOwned>(
    bytes: impl AsRef<[u8]>,
    label: &str,
) -> Result<T, EngineError> {
    decode_json_document(bytes.as_ref(), label)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScenarioBundleManifest {
    pub items_file: String,
    pub characters_file: String,
    pub assets_file: String,
    /// Present when `catalogRef` is set in `scenario.json`.
    pub catalog_file: Option<String>,
    /// Present when `libraryRef` is set in `scenario.json`.
    pub library_file: Option<String>,
    pub chapters: Vec<ScenarioChapterManifest>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScenarioChapterManifest {
    pub id: String,
    pub file_name: String,
}

/// Parse scenario JSON bytes for sidecar paths and chapter refs (no I/O).
pub fn parse_scenario_manifest(scenario: &[u8]) -> Result<ScenarioBundleManifest, EngineError> {
    let scenario_wire: GameContentWire = decode_document(scenario, "scenario")?;
    Ok(ScenarioBundleManifest {
        items_file: scenario_wire
            .items_ref
            .unwrap_or_else(|| "items.json".to_string()),
        characters_file: scenario_wire
            .characters_ref
            .unwrap_or_else(|| "characters.json".to_string()),
        assets_file: scenario_wire
            .assets_ref
            .unwrap_or_else(|| "assets.json".to_string()),
        catalog_file: scenario_wire.catalog_ref.clone(),
        library_file: scenario_wire.library_ref.clone(),
        chapters: scenario_wire
            .chapters
            .into_iter()
            .map(|chapter| ScenarioChapterManifest {
                id: chapter.id,
                file_name: chapter.file_ref,
            })
            .collect(),
    })
}

/// Decode scenario bundle JSON document bytes into runtime content (no I/O).
/// `catalog` and `library` are optional; pass `None` when the sidecar is absent.
pub fn decode_scenario_bundle_json(
    scenario: impl AsRef<[u8]>,
    items: impl AsRef<[u8]>,
    characters: impl AsRef<[u8]>,
    assets: impl AsRef<[u8]>,
    catalog: Option<impl AsRef<[u8]>>,
    library: Option<impl AsRef<[u8]>>,
    chapters: Vec<impl AsRef<[u8]>>,
) -> Result<GameContent, EngineError> {
    let scenario: GameContentWire = decode_document(scenario, "scenario")?;
    let items: ItemCatalogWire = decode_document(items, "items")?;
    let characters: CharacterCatalogWire = decode_document(characters, "characters")?;
    let assets: AssetCatalogWire = decode_document(assets, "assets")?;
    let meta: MetaCatalogWire = match catalog {
        Some(bytes) => {
            let wire: MetaCatalogWire = decode_document(bytes, "catalog")?;
            validate_document_envelope("catalog", &wire.spec, CATALOG_SPEC, wire.format_version)?;
            wire
        }
        None => MetaCatalogWire::default(),
    };

    validate_document_envelope(
        "scenario",
        &scenario.spec,
        SCENARIO_SPEC,
        scenario.format_version,
    )?;
    validate_document_envelope("items", &items.spec, ITEMS_SPEC, items.format_version)?;
    validate_document_envelope(
        "characters",
        &characters.spec,
        CHARACTERS_SPEC,
        characters.format_version,
    )?;
    validate_document_envelope(
        "assets",
        &assets.spec,
        ASSETS_BUNDLE_SPEC,
        assets.format_version,
    )?;

    let loaded_chapters = chapters_from_wire_bytes(&chapters)?;
    let prepared_library = match &library {
        Some(bytes) => Some(decode_library_bytes(bytes.as_ref())?),
        None => None,
    };
    let library_source = library.map(|bytes| bytes.as_ref().to_vec());
    let items_ref = scenario.items_ref.clone();
    let characters_ref = scenario.characters_ref.clone();
    let assets_ref = scenario.assets_ref.clone();
    let content = bundle_from_wire(
        scenario,
        items,
        characters,
        assets,
        meta,
        LibraryWireContext {
            prepared: prepared_library,
            source: library_source,
        },
        loaded_chapters,
    )?;
    logging::debug_fields(
        "engine",
        "bundle assembled",
        serde_json::json!({
            "title": content.title,
            "revision": content.revision,
            "chapters": content.chapters.len(),
            "nodes": content.nodes.len(),
            "items": content.items.items.len(),
            "characters": content.characters.characters.len(),
            "items_ref": items_ref,
            "characters_ref": characters_ref,
            "assets_ref": assets_ref,
        }),
    );
    Ok(content)
}

pub fn parse_chapter_documents(chapters_json: &str) -> Result<Vec<Vec<u8>>, EngineError> {
    if chapters_json.trim().is_empty() {
        return Ok(Vec::new());
    }

    let documents: Vec<String> =
        serde_json::from_str(chapters_json).map_err(|error| EngineError::ContentDecodeError {
            format: "json".to_string(),
            message: format!("chapters: {error}"),
        })?;
    Ok(documents
        .into_iter()
        .map(|document| document.into_bytes())
        .collect())
}

#[cfg(test)]
mod tests {
    use blackbox_engine::EngineError;
    use blackbox_engine::content::NodeMode;

    use super::*;

    const MINIMAL_ITEMS: &str = r#"{
        "spec": "com.blackbox.items",
        "formatVersion": 1,
        "items": {}
    }"#;

    const MINIMAL_CHARACTERS: &str = r#"{
        "spec": "com.blackbox.characters",
        "formatVersion": 1,
        "characters": {}
    }"#;

    const MINIMAL_ASSETS: &str = include_str!("../../../../tests/assets/assets.json");

    const LIBRARY: &str = r#"{
        "spec": "com.blackbox.library",
        "formatVersion": 1,
        "snippets": {
            "hud_vitals": {
                "kind": "stage_direction",
                "text": "HP: {stat.hp}/{stat.max_hp}."
            }
        },
        "templates": {
            "game_over_tpl": {
                "title": "Signal Lost",
                "mode": "game_over",
                "text": ["@hud_vitals"],
                "choices": [
                    {
                        "id": "restart",
                        "label": "Restart.",
                        "action": { "type": "restartGame", "startNodeId": "intro" }
                    }
                ]
            }
        }
    }"#;

    const CHAPTER: &str = r#"{
        "spec": "com.blackbox.chapter",
        "formatVersion": 1,
        "id": "test",
        "title": "Test",
        "startNodeId": "intro",
        "nodes": {
            "intro": {
                "id": "intro",
                "text": ["@hud_vitals", { "kind": "paragraph", "text": "Hello." }],
                "choices": [
                    { "id": "continue", "label": "Continue.", "goto": "intro" }
                ]
            },
            "death": {
                "id": "death",
                "$extends": "game_over_tpl",
                "text": [{ "kind": "paragraph", "text": "You died." }]
            }
        }
    }"#;

    const SCENARIO: &str = r#"{
        "spec": "com.blackbox.scenario",
        "formatVersion": 1,
        "libraryRef": "library.json",
        "chapters": [
            { "id": "test", "title": "Test", "ref": "chapter.json" }
        ]
    }"#;

    fn decode_test_bundle() -> GameContent {
        decode_scenario_bundle_json(
            SCENARIO,
            MINIMAL_ITEMS,
            MINIMAL_CHARACTERS,
            MINIMAL_ASSETS,
            None::<&[u8]>,
            Some(LIBRARY),
            vec![CHAPTER],
        )
        .expect("bundle with library should decode")
    }

    #[test]
    fn manifest_includes_library_ref() {
        let manifest = parse_scenario_manifest(SCENARIO.as_bytes()).expect("manifest");
        assert_eq!(manifest.library_file.as_deref(), Some("library.json"));
    }

    #[test]
    fn snippet_reference_expands_in_loaded_nodes() {
        let content = decode_test_bundle();
        let intro = content.nodes.get("intro").expect("intro node");
        assert_eq!(intro.text.len(), 2);
        assert_eq!(intro.text[0].kind, "stage_direction");
        assert_eq!(intro.text[0].text, "HP: {stat.hp}/{stat.max_hp}.");
        assert_eq!(intro.text[1].text, "Hello.");
    }

    #[test]
    fn extends_merges_template_fields_into_node() {
        let content = decode_test_bundle();
        let death = content.nodes.get("death").expect("death node");
        assert_eq!(death.title.as_deref(), Some("Signal Lost"));
        assert_eq!(death.mode, NodeMode::GameOver);
        assert_eq!(death.text.len(), 1);
        assert_eq!(death.text[0].text, "You died.");
        assert_eq!(death.choices.len(), 1);
        assert_eq!(death.choices[0].presentation.id, "restart");
    }

    #[test]
    fn unknown_snippet_in_chapter_is_rejected() {
        let chapter = r#"{
            "spec": "com.blackbox.chapter",
            "formatVersion": 1,
            "id": "test",
            "title": "Test",
            "startNodeId": "intro",
            "nodes": {
                "intro": {
                    "id": "intro",
                    "text": ["@missing"],
                    "choices": []
                }
            }
        }"#;

        let error = decode_scenario_bundle_json(
            SCENARIO,
            MINIMAL_ITEMS,
            MINIMAL_CHARACTERS,
            MINIMAL_ASSETS,
            None::<&[u8]>,
            Some(LIBRARY),
            vec![chapter],
        )
        .unwrap_err();

        assert!(matches!(error, EngineError::ValidationError(_)));
    }

    #[test]
    fn extends_without_library_is_rejected() {
        let error = decode_scenario_bundle_json(
            SCENARIO,
            MINIMAL_ITEMS,
            MINIMAL_CHARACTERS,
            MINIMAL_ASSETS,
            None::<&[u8]>,
            None::<&[u8]>,
            vec![CHAPTER],
        )
        .unwrap_err();

        assert!(matches!(error, EngineError::ValidationError(_)));
    }
}
