use std::fs;
use std::path::{Path, PathBuf};

use blackbox_format::{
    ASSETS_BUNDLE_SPEC, CATALOG_SPEC, CHAPTER_SPEC, CHARACTERS_SPEC, ITEMS_SPEC, LIBRARY_SPEC,
    SCENARIO_SPEC, SUPPORTED_FORMAT_VERSION, parse_scenario_manifest,
};

use crate::report::{LintIssue, LintReport};
use crate::rules::LintContext;

pub fn check_wire_envelopes(ctx: &LintContext<'_>, report: &mut LintReport) {
    let scenario_path = ctx.scenario_path;
    let scenario_text = match fs::read_to_string(scenario_path) {
        Ok(text) => text,
        Err(error) => {
            report.push(
                LintIssue::error(
                    "syntax",
                    format!("read {}: {error}", scenario_path.display()),
                )
                .with_context(scenario_path.display().to_string()),
            );
            return;
        }
    };

    let base_dir = match scenario_path.parent() {
        Some(dir) => dir,
        None => {
            report.push(
                LintIssue::error("syntax", "scenario path has no parent directory")
                    .with_context(scenario_path.display().to_string()),
            );
            return;
        }
    };

    let manifest = match parse_scenario_manifest(scenario_text.as_bytes()) {
        Ok(manifest) => manifest,
        Err(error) => {
            report.push(
                LintIssue::error("syntax", error.to_string())
                    .with_context(scenario_path.display().to_string()),
            );
            return;
        }
    };

    check_document_envelope(
        "scenario",
        &scenario_text,
        SCENARIO_SPEC,
        scenario_path.display().to_string(),
        report,
    );

    check_file_envelope(
        base_dir,
        &manifest.items_file,
        "items",
        ITEMS_SPEC,
        scenario_path,
        report,
    );
    check_file_envelope(
        base_dir,
        &manifest.characters_file,
        "characters",
        CHARACTERS_SPEC,
        scenario_path,
        report,
    );
    check_file_envelope(
        base_dir,
        &manifest.assets_file,
        "assets",
        ASSETS_BUNDLE_SPEC,
        scenario_path,
        report,
    );

    if let Some(catalog_file) = &manifest.catalog_file {
        check_file_envelope(
            base_dir,
            catalog_file,
            "catalog",
            CATALOG_SPEC,
            scenario_path,
            report,
        );
    }

    if let Some(library_file) = &manifest.library_file {
        check_file_envelope(
            base_dir,
            library_file,
            "library",
            LIBRARY_SPEC,
            scenario_path,
            report,
        );
    }

    for chapter in &manifest.chapters {
        check_file_envelope(
            base_dir,
            &chapter.file_name,
            "chapter",
            CHAPTER_SPEC,
            scenario_path,
            report,
        );
    }
}

fn check_file_envelope(
    base_dir: &Path,
    file_name: &str,
    label: &str,
    expected_spec: &str,
    scenario_path: &Path,
    report: &mut LintReport,
) {
    let path = base_dir.join(file_name);
    match fs::read_to_string(&path) {
        Ok(text) => check_document_envelope(
            label,
            &text,
            expected_spec,
            path.display().to_string(),
            report,
        ),
        Err(error) => {
            report.push(
                LintIssue::error(
                    "syntax",
                    format!("read {label} ({}): {error}", path.display()),
                )
                .with_context(scenario_path.display().to_string()),
            );
        }
    }
}

fn check_document_envelope(
    label: &str,
    text: &str,
    expected_spec: &str,
    context: String,
    report: &mut LintReport,
) {
    let value: serde_json::Value = match serde_json::from_str(text) {
        Ok(value) => value,
        Err(error) => {
            report.push(
                LintIssue::error("syntax", format!("{label}: {error}")).with_context(context),
            );
            return;
        }
    };

    let Some(object) = value.as_object() else {
        report.push(
            LintIssue::error("syntax", format!("{label}: root must be a JSON object"))
                .with_context(context),
        );
        return;
    };

    match object.get("spec").and_then(|spec| spec.as_str()) {
        Some(spec) if spec == expected_spec => {}
        Some(spec) => {
            report.push(
                LintIssue::error(
                    "wire-spec",
                    format!("{label} has spec '{spec}', expected '{expected_spec}'"),
                )
                .with_context(&context),
            );
        }
        None => {
            report.push(
                LintIssue::error(
                    "wire-spec",
                    format!("{label} is missing required field 'spec'"),
                )
                .with_context(&context),
            );
        }
    }

    match object
        .get("formatVersion")
        .and_then(|format_version| format_version.as_u64())
    {
        Some(format_version) if format_version == SUPPORTED_FORMAT_VERSION as u64 => {}
        Some(format_version) => {
            report.push(
                LintIssue::error(
                    "format-version",
                    format!(
                        "{label} has formatVersion {format_version}, expected {SUPPORTED_FORMAT_VERSION}"
                    ),
                )
                .with_context(&context),
            );
        }
        None => {
            report.push(
                LintIssue::error(
                    "format-version",
                    format!("{label} is missing required field 'formatVersion'"),
                )
                .with_context(&context),
            );
        }
    }
}

#[allow(dead_code)]
fn bundle_sidecar_paths(
    scenario_path: &Path,
    scenario_text: &str,
) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let base_dir = scenario_path
        .parent()
        .ok_or_else(|| "scenario path has no parent directory".to_string())?;

    let value: serde_json::Value =
        serde_json::from_str(scenario_text).map_err(|error| format!("scenario: {error}"))?;

    let items_ref = value
        .get("itemsRef")
        .and_then(|value| value.as_str())
        .unwrap_or("items.json");
    let characters_ref = value
        .get("charactersRef")
        .and_then(|value| value.as_str())
        .unwrap_or("characters.json");
    let assets_ref = value
        .get("assetsRef")
        .and_then(|value| value.as_str())
        .unwrap_or("assets.json");

    Ok((
        base_dir.join(items_ref),
        base_dir.join(characters_ref),
        base_dir.join(assets_ref),
    ))
}
