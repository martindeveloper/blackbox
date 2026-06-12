use std::path::Path;

use blackbox::{EngineError, GameContent};
use blackbox_format::{decode_scenario_bundle_json, parse_scenario_manifest};

#[derive(Debug, Clone)]
pub struct ScenarioBundleFiles {
    pub scenario: Vec<u8>,
    pub items: Vec<u8>,
    pub items_file: String,
    pub characters: Vec<u8>,
    pub characters_file: String,
    pub assets: Vec<u8>,
    pub assets_file: String,
    pub catalog: Option<Vec<u8>>,
    pub catalog_file: Option<String>,
    pub library: Option<Vec<u8>>,
    pub library_file: Option<String>,
    pub chapters: Vec<BundleChapterFile>,
}

#[derive(Debug, Clone)]
pub struct BundleChapterFile {
    pub id: String,
    pub file_name: String,
    pub bytes: Vec<u8>,
}

fn read_file_bytes(path: &Path, label: &str) -> Result<Vec<u8>, EngineError> {
    std::fs::read(path).map_err(|error| EngineError::ContentDecodeError {
        format: "json".to_string(),
        message: format!("read {label} ({}): {error}", path.display()),
    })
}

pub fn read_scenario_bundle_files(
    scenario_path: impl AsRef<Path>,
) -> Result<ScenarioBundleFiles, EngineError> {
    let scenario_path = scenario_path.as_ref();
    let scenario = read_file_bytes(scenario_path, "scenario")?;

    let base_dir = scenario_path
        .parent()
        .ok_or_else(|| EngineError::ContentDecodeError {
            format: "json".to_string(),
            message: "scenario path has no parent directory".to_string(),
        })?;

    let manifest = parse_scenario_manifest(&scenario)?;
    let items = read_file_bytes(&base_dir.join(&manifest.items_file), &manifest.items_file)?;
    let characters = read_file_bytes(
        &base_dir.join(&manifest.characters_file),
        &manifest.characters_file,
    )?;
    let assets = read_file_bytes(&base_dir.join(&manifest.assets_file), &manifest.assets_file)?;
    let catalog = manifest
        .catalog_file
        .as_deref()
        .map(|file| read_file_bytes(&base_dir.join(file), file))
        .transpose()?;
    let library = manifest
        .library_file
        .as_deref()
        .map(|file| read_file_bytes(&base_dir.join(file), file))
        .transpose()?;

    let mut chapters = Vec::with_capacity(manifest.chapters.len());
    for chapter in manifest.chapters {
        let bytes = read_file_bytes(&base_dir.join(&chapter.file_name), &chapter.file_name)?;
        chapters.push(BundleChapterFile {
            id: chapter.id,
            file_name: chapter.file_name,
            bytes,
        });
    }

    Ok(ScenarioBundleFiles {
        scenario,
        items,
        items_file: manifest.items_file,
        characters,
        characters_file: manifest.characters_file,
        assets,
        assets_file: manifest.assets_file,
        catalog,
        catalog_file: manifest.catalog_file,
        library,
        library_file: manifest.library_file,
        chapters,
    })
}

pub fn decode_scenario_bundle_files(
    files: &ScenarioBundleFiles,
) -> Result<GameContent, EngineError> {
    let chapter_bytes: Vec<&[u8]> = files
        .chapters
        .iter()
        .map(|chapter| chapter.bytes.as_slice())
        .collect();
    decode_scenario_bundle_json(
        &files.scenario,
        &files.items,
        &files.characters,
        &files.assets,
        files.catalog.as_deref(),
        files.library.as_deref(),
        chapter_bytes,
    )
}

pub fn load_bundle_from_path(scenario_path: impl AsRef<Path>) -> Result<GameContent, EngineError> {
    let files = read_scenario_bundle_files(scenario_path)?;
    decode_scenario_bundle_files(&files)
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use blackbox_format::{
        decode_msgpack_bundle_bytes, encode_assets_document, encode_chapter_document,
        encode_characters_document, encode_items_document, encode_library_document,
        encode_scenario_document,
    };

    use super::*;

    fn sample_scenario() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../tests/fixtures/sample_scenario/scenario.json")
    }

    #[test]
    fn load_chaptered_scenario_from_disk() {
        let content = load_bundle_from_path(sample_scenario()).expect("load scenario");
        assert_eq!(content.title.as_deref(), Some("Sample Scenario"));
        assert_eq!(content.chapters.len(), 2);
        assert!(content.nodes.contains_key("alpha_start"));
        assert!(content.nodes.contains_key("beta_start"));
    }

    #[test]
    fn read_then_decode_matches_load_from_path() {
        let scenario = sample_scenario();
        let direct = load_bundle_from_path(&scenario).expect("direct load");
        let files = read_scenario_bundle_files(&scenario).expect("read files");
        let decoded = decode_scenario_bundle_files(&files).expect("decode files");
        assert_eq!(direct.title, decoded.title);
        assert_eq!(direct.chapters.len(), decoded.chapters.len());
        assert_eq!(direct.nodes.len(), decoded.nodes.len());
    }

    #[test]
    fn msgpack_roundtrip_matches_json_bundle() {
        let scenario_path = sample_scenario();
        let files = read_scenario_bundle_files(&scenario_path).expect("read bundle files");
        let chapter_bytes: Vec<&[u8]> = files
            .chapters
            .iter()
            .map(|chapter| chapter.bytes.as_slice())
            .collect();
        let json_content = decode_scenario_bundle_json(
            &files.scenario,
            &files.items,
            &files.characters,
            &files.assets,
            files.catalog.as_deref(),
            files.library.as_deref(),
            chapter_bytes,
        )
        .expect("json bundle should load");

        let library_msgpack = files
            .library
            .as_ref()
            .map(|bytes| encode_library_document(bytes).expect("encode library"));
        let msgpack_content = decode_msgpack_bundle_bytes(
            encode_scenario_document(&files.scenario).expect("encode scenario"),
            encode_items_document(&files.items).expect("encode items"),
            encode_characters_document(&files.characters).expect("encode characters"),
            encode_assets_document(&files.assets).expect("encode assets"),
            files
                .chapters
                .iter()
                .map(|chapter| encode_chapter_document(&chapter.bytes).expect("encode chapter"))
                .collect::<Vec<_>>(),
            library_msgpack.as_deref(),
        )
        .expect("decode msgpack bundle");

        assert_eq!(msgpack_content.title, json_content.title);
        assert_eq!(msgpack_content.revision, json_content.revision);
        assert_eq!(msgpack_content.chapters.len(), json_content.chapters.len());
        assert_eq!(msgpack_content.nodes.len(), json_content.nodes.len());
        assert!(msgpack_content.nodes.contains_key("alpha_start"));
        assert!(msgpack_content.nodes.contains_key("beta_start"));
    }
}
