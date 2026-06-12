use std::path::{Path, PathBuf};

const SIDECAR_FILES: &[&str] = &["items.json", "characters.json", "assets.json"];
const CHAPTER_FILE_PREFIX: &str = "chapter_";

pub fn discover_scenarios(target: &Path) -> anyhow::Result<Vec<PathBuf>> {
    if target.is_file() {
        return Ok(vec![target.to_path_buf()]);
    }

    if !target.is_dir() {
        anyhow::bail!("target does not exist: {}", target.display());
    }

    let mut scenarios = Vec::new();

    if target.join("scenario.json").is_file() {
        scenarios.push(target.join("scenario.json"));
    }

    for entry in std::fs::read_dir(target)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_dir() {
            let manifest = path.join("scenario.json");
            if manifest.is_file() {
                scenarios.push(manifest);
            }
            continue;
        }

        if !path.is_file() {
            continue;
        }

        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };

        if file_name == "scenario.json" {
            continue;
        }

        if !file_name.ends_with(".json")
            || SIDECAR_FILES.contains(&file_name)
            || file_name.starts_with(CHAPTER_FILE_PREFIX)
        {
            continue;
        }

        if looks_like_legacy_scenario(&path)? {
            scenarios.push(path);
        }
    }

    scenarios.sort();
    scenarios.dedup();
    Ok(scenarios)
}

fn looks_like_legacy_scenario(path: &Path) -> anyhow::Result<bool> {
    let text = std::fs::read_to_string(path)?;
    let value: serde_json::Value = serde_json::from_str(&text)?;
    let has_graph = value.get("startNodeId").is_some() && value.get("nodes").is_some();
    let spec_ok =
        value.get("spec").and_then(|spec| spec.as_str()) == Some(blackbox_format::SCENARIO_SPEC);
    Ok(has_graph && spec_ok)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovers_chaptered_scenario_folder() {
        let target =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/sample_scenario");
        let scenarios = discover_scenarios(&target).expect("discover");
        assert_eq!(scenarios.len(), 1);
        assert!(scenarios[0].ends_with("sample_scenario/scenario.json"));
    }
}
