use std::path::Path;

use blackbox::{EngineError, GameContent};
use blackbox_format::{decode_scenario_bundle_json, parse_scenario_manifest};

fn read(path: &Path, label: &str) -> Result<Vec<u8>, EngineError> {
    std::fs::read(path).map_err(|error| EngineError::ContentDecodeError {
        format: "json".to_string(),
        message: format!("read {label} ({}): {error}", path.display()),
    })
}

/// Decode a scenario bundle from its manifest path, resolving every sidecar
/// relative to the manifest's directory.
pub fn load_bundle(scenario_path: &Path) -> Result<GameContent, EngineError> {
    let scenario = read(scenario_path, "scenario")?;
    let base = scenario_path
        .parent()
        .ok_or_else(|| EngineError::ContentDecodeError {
            format: "json".to_string(),
            message: "scenario path has no parent directory".to_string(),
        })?;

    let manifest = parse_scenario_manifest(&scenario)?;
    let items = read(&base.join(&manifest.items_file), &manifest.items_file)?;
    let characters = read(
        &base.join(&manifest.characters_file),
        &manifest.characters_file,
    )?;
    let assets = read(&base.join(&manifest.assets_file), &manifest.assets_file)?;
    let catalog = manifest
        .catalog_file
        .as_deref()
        .map(|f| read(&base.join(f), f))
        .transpose()?;
    let library = manifest
        .library_file
        .as_deref()
        .map(|f| read(&base.join(f), f))
        .transpose()?;

    let mut chapters = Vec::with_capacity(manifest.chapters.len());
    for chapter in &manifest.chapters {
        chapters.push(read(&base.join(&chapter.file_name), &chapter.file_name)?);
    }

    decode_scenario_bundle_json(
        &scenario,
        &items,
        &characters,
        &assets,
        catalog.as_deref(),
        library.as_deref(),
        chapters.iter().map(Vec::as_slice).collect(),
    )
}
