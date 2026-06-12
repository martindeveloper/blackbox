use std::path::Path;

use blackbox::{EngineError, GameContent};
use blackbox_format::{decode_scenario_bundle_json, parse_scenario_manifest};

fn read_file_bytes(path: &Path, label: &str) -> Result<Vec<u8>, EngineError> {
    std::fs::read(path).map_err(|error| EngineError::ContentDecodeError {
        format: "json".to_string(),
        message: format!("read {label} ({}): {error}", path.display()),
    })
}

pub fn load_bundle_from_path(scenario_path: impl AsRef<Path>) -> Result<GameContent, EngineError> {
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

    let mut chapter_bytes = Vec::with_capacity(manifest.chapters.len());
    for chapter in manifest.chapters {
        chapter_bytes.push(read_file_bytes(
            &base_dir.join(&chapter.file_name),
            &chapter.file_name,
        )?);
    }

    decode_scenario_bundle_json(
        &scenario,
        &items,
        &characters,
        &assets,
        catalog.as_deref(),
        library.as_deref(),
        chapter_bytes.iter().map(|bytes| bytes.as_slice()).collect(),
    )
}
