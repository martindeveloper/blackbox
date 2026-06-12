use std::path::{Path, PathBuf};
use std::process::ExitCode;

use anyhow::{Context, Result, bail};

use crate::format::{
    BOX_MAGIC, BOX_VERSION, BundleMap, PROJECT_MAP_NAME, PROJECT_MAP_SPEC, ProjectMap,
    load_box_bytes,
};

use std::fmt::Write as _;

macro_rules! wln {
    ($w:expr $(, $($arg:tt)*)?) => {{ let _ = writeln!($w $(, $($arg)*)?); }};
}

pub const BOX_HEADER_SIZE: usize = 16;

#[derive(Debug, Clone)]
pub struct InspectOptions {
    pub map_path: PathBuf,
    pub box_path: PathBuf,
    /// Emit a single structured JSON object instead of the text report.
    pub json: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EntryStatus {
    Ok,
    Warn,
    Error,
}

struct InspectedEntry {
    key: String,
    map_codec: String,
    sniffed: Option<&'static str>,
    offset: u64,
    length: u64,
    status: EntryStatus,
    note: &'static str,
}

struct InspectReport {
    map: BundleMap,
    box_bytes: usize,
    payload_bytes: u64,
    header_ok: bool,
    version_ok: bool,
    entries: Vec<InspectedEntry>,
    structural_errors: Vec<String>,
}

pub fn run(options: &InspectOptions) -> ExitCode {
    if let Some(parent) = options.map_path.parent() {
        let project_map = parent.join(PROJECT_MAP_NAME);
        if project_map.is_file()
            && options.map_path.file_name().is_some_and(|name| {
                name == "bundle.box.meta" || name.to_str() == Some(PROJECT_MAP_NAME)
            })
        {
            return run_project(parent, options.json);
        }
    }

    let out = blackbox_output::Output::new(options.json);
    match inspect(options) {
        Ok(report) => {
            let _ = out.emit(
                || single_report_json(options, &report),
                || {
                    let mut buf = String::new();
                    print_report(&mut buf, options, &report);
                    buf
                },
            );
            if report_is_ok(&report) {
                ExitCode::SUCCESS
            } else {
                ExitCode::from(1)
            }
        }
        Err(error) => {
            out.error(format!("blackbox-bundler: {error:#}"));
            let _ = out.emit(|| error_json(&error.to_string()), String::new);
            ExitCode::from(2)
        }
    }
}

fn inspect(options: &InspectOptions) -> Result<InspectReport> {
    let map_text = std::fs::read_to_string(&options.map_path)
        .with_context(|| format!("read map {}", options.map_path.display()))?;
    let map: BundleMap =
        serde_json::from_str(&map_text).context("parse bundle.box.meta as JSON")?;

    let box_bytes = load_box_bytes(&options.box_path, map.archive_compression.as_deref())
        .with_context(|| format!("load box {}", options.box_path.display()))?;

    let header_ok = box_bytes.len() >= BOX_HEADER_SIZE && box_bytes.starts_with(BOX_MAGIC);
    let version_ok = header_ok
        && u32::from_le_bytes(box_bytes[4..8].try_into().expect("version slice")) == BOX_VERSION;
    let payload_bytes = box_bytes.len().saturating_sub(BOX_HEADER_SIZE) as u64;
    let mut structural_errors = Vec::new();
    if !header_ok {
        structural_errors.push("bundle.box header magic is invalid".to_string());
    }
    if header_ok && !version_ok {
        structural_errors.push(format!(
            "bundle.box version mismatch (expected {BOX_VERSION})"
        ));
    }
    if options
        .box_path
        .file_name()
        .and_then(|name| name.to_str())
        .is_none_or(|name| name != map.blob)
    {
        structural_errors.push(format!(
            "map blob field '{}' does not match box file name",
            map.blob
        ));
    }

    let mut entries = Vec::with_capacity(map.entries.len());
    let mut ranges: Vec<(u64, u64, String)> = Vec::new();

    for (key, entry) in &map.entries {
        let note = entry_note(key);
        let mut status = EntryStatus::Ok;
        let mut entry_errors = Vec::new();

        if entry.offset % 4 != 0 {
            entry_errors.push(format!("offset {} is not 4-byte aligned", entry.offset));
        }

        let end = entry.offset.saturating_add(entry.length);
        if end > payload_bytes {
            entry_errors.push(format!(
                "range {}..{end} exceeds payload size {payload_bytes}",
                entry.offset
            ));
        }

        let sniffed = if !entry_errors.is_empty() {
            None
        } else {
            let start = BOX_HEADER_SIZE + entry.offset as usize;
            let end = start + entry.length as usize;
            sniff_codec(&box_bytes[start..end])
        };

        if let Some(sniffed) = sniffed
            && !codec_matches(entry.codec.as_str(), sniffed)
        {
            status = EntryStatus::Warn;
        }

        if !entry_errors.is_empty() {
            status = EntryStatus::Error;
            structural_errors.extend(entry_errors);
        }

        ranges.push((entry.offset, end, key.clone()));
        entries.push(InspectedEntry {
            key: key.clone(),
            map_codec: entry.codec.as_str().to_string(),
            sniffed,
            offset: entry.offset,
            length: entry.length,
            status,
            note,
        });
    }

    ranges.sort_by_key(|(offset, _, _)| *offset);
    for window in ranges.windows(2) {
        let (_, prev_end, prev_key) = &window[0];
        let (next_offset, _, next_key) = &window[1];
        if *prev_end > *next_offset {
            structural_errors.push(format!(
                "entries overlap: '{prev_key}' ends at {prev_end}, '{next_key}' starts at {next_offset}"
            ));
        }
    }

    Ok(InspectReport {
        map,
        box_bytes: box_bytes.len(),
        payload_bytes,
        header_ok,
        version_ok,
        entries,
        structural_errors,
    })
}

fn print_report(w: &mut String, options: &InspectOptions, report: &InspectReport) {
    wln!(
        w,
        "blackbox-bundler inspect — {}",
        options
            .map_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .display()
    );
    wln!(w);
    wln!(
        w,
        "map:      {} (spec {}, v{})",
        options.map_path.display(),
        report.map.spec,
        report.map.format_version
    );
    wln!(
        w,
        "box:      {} ({} bytes, payload {} bytes)",
        options.box_path.display(),
        report.box_bytes,
        report.payload_bytes
    );
    wln!(
        w,
        "scenario: {}  platform: {}  entries: {}{}",
        report.map.scenario,
        report.map.platform,
        report.entries.len(),
        format_bundle_meta(&report.map.bundle_id, &report.map.dependencies)
    );
    wln!(
        w,
        "header:   magic {}  version {}",
        if report.header_ok { "ok" } else { "INVALID" },
        if report.version_ok { "ok" } else { "INVALID" }
    );
    wln!(w);

    print_entry_table(w, report);
    print_bundle_footer(w, report);
}

fn print_entry_table(w: &mut String, report: &InspectReport) {
    wln!(
        w,
        "{:<6}  {:<36}  {:<8}  {:<8}  {:>10}  {:>10}  NOTE",
        "STATUS",
        "KEY",
        "CODEC",
        "SNIFFED",
        "BYTES",
        "OFFSET"
    );
    wln!(w, "{}", "-".repeat(100));

    for entry in &report.entries {
        let status = match entry.status {
            EntryStatus::Ok => "ok",
            EntryStatus::Warn => "WARN",
            EntryStatus::Error => "ERROR",
        };
        let sniffed = entry.sniffed.unwrap_or("-");
        wln!(
            w,
            "{:<6}  {:<36}  {:<8}  {:<8}  {:>10}  {:>10}  {}",
            status,
            truncate(&entry.key, 36),
            entry.map_codec,
            sniffed,
            entry.length,
            entry.offset,
            entry.note
        );
    }

    wln!(w);
    print_codec_totals(w, report);
}

fn print_bundle_footer(w: &mut String, report: &InspectReport) {
    if !report.structural_errors.is_empty() {
        wln!(w);
        wln!(w, "ERRORS");
        for error in &report.structural_errors {
            wln!(w, "  - {error}");
        }
    }

    let warns = count_entry_warnings(report);
    if warns > 0 {
        wln!(w);
        wln!(w, "WARNINGS: {warns} entr(y/ies) with codec/sniff mismatch");
    }

    wln!(w);
    if report_is_ok(report) {
        wln!(w, "result: ok");
    } else {
        wln!(w, "result: INVALID — map and box do not match");
    }
}

fn print_codec_totals(w: &mut String, report: &InspectReport) {
    let mut totals: std::collections::BTreeMap<&str, (u64, u32)> =
        std::collections::BTreeMap::new();
    for entry in &report.entries {
        let slot = totals.entry(entry.map_codec.as_str()).or_insert((0, 0));
        slot.0 += entry.length;
        slot.1 += 1;
    }

    wln!(w, "TOTALS BY CODEC");
    for (codec, (bytes, count)) in totals {
        wln!(w, "  {codec:<8}  {count:>3} files  {bytes:>10} bytes");
    }
}

fn entry_note(key: &str) -> &'static str {
    if key == "content/scenario" {
        return "scenario manifest";
    }
    if key == "content/items" {
        return "item catalog";
    }
    if key == "content/assets" {
        return "asset catalog (logical src paths)";
    }
    if key == "content/catalog" {
        return "story catalog (events and flags)";
    }
    if key == "content/library" {
        return "snippet and template library";
    }
    if key == "content/characters" {
        return "character catalog";
    }
    if key.starts_with("content/chapters/") {
        return "chapter document";
    }
    if key.starts_with("textures/") {
        return "texture (key keeps source extension)";
    }
    if key.starts_with("music/") {
        return "music track";
    }
    if key.starts_with("sfx/") {
        return "sound effect";
    }
    "asset"
}

fn sniff_codec(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("png");
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && bytes[8..12] == *b"WEBP" {
        return Some("webp");
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("jpeg");
    }
    if bytes.starts_with(b"OggS") {
        return Some("ogg");
    }
    if bytes.starts_with(b"ID3")
        || bytes.len() >= 2 && bytes[0] == 0xFF && (bytes[1] & 0xE0) == 0xE0
    {
        return Some("mp3");
    }
    if bytes.len() >= 8 && bytes[4..8] == *b"ftyp" {
        return Some("m4a");
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && bytes[8..12] == *b"WAVE" {
        return Some("wav");
    }
    None
}

fn codec_matches(map_codec: &str, sniffed: &str) -> bool {
    matches!(
        (map_codec, sniffed),
        ("webp", "webp")
            | ("png", "png")
            | ("jpeg", "jpeg")
            | ("ogg", "ogg")
            | ("mp3", "mp3")
            | ("m4a", "m4a")
            | ("wav", "wav")
            | ("msgpack", _)
    )
}

fn format_bundle_meta(bundle_id: &Option<String>, dependencies: &[String]) -> String {
    let mut parts = Vec::new();
    if let Some(id) = bundle_id {
        parts.push(format!("  bundle: {id}"));
    }
    if !dependencies.is_empty() {
        parts.push(format!("  dependencies: [{}]", dependencies.join(", ")));
    }
    parts.join("")
}

fn report_is_ok(report: &InspectReport) -> bool {
    report.structural_errors.is_empty()
        && !report
            .entries
            .iter()
            .any(|entry| entry.status == EntryStatus::Error)
}

fn count_entry_warnings(report: &InspectReport) -> usize {
    report
        .entries
        .iter()
        .filter(|entry| entry.status == EntryStatus::Warn)
        .count()
}

fn print_bundle_warnings(w: &mut String, report: &InspectReport) {
    let warns = count_entry_warnings(report);
    if warns > 0 {
        wln!(w, "WARNINGS: {warns} entr(y/ies) with codec/sniff mismatch");
    }
}

fn run_project(dir: &Path, json: bool) -> ExitCode {
    let out = blackbox_output::Output::new(json);
    match inspect_project(dir) {
        Ok((project, bundles)) => {
            let _ = out.emit(
                || project_report_json(dir, &project, &bundles),
                || {
                    let mut buf = String::new();
                    print_project_reports(&mut buf, dir, &project, &bundles);
                    buf
                },
            );
            if bundles.iter().all(bundle_report_ok) {
                ExitCode::SUCCESS
            } else {
                ExitCode::from(1)
            }
        }
        Err(error) => {
            out.error(format!("blackbox-bundler: {error:#}"));
            let _ = out.emit(|| error_json(&error.to_string()), String::new);
            ExitCode::from(2)
        }
    }
}

struct ProjectBundleReport {
    label: String,
    title: String,
    dependencies: Vec<String>,
    inspect: Result<InspectReport, String>,
}

fn bundle_report_ok(bundle: &ProjectBundleReport) -> bool {
    match &bundle.inspect {
        Ok(report) => report_is_ok(report),
        Err(_) => false,
    }
}

fn inspect_project(dir: &Path) -> Result<(ProjectMap, Vec<ProjectBundleReport>)> {
    let project_path = dir.join(PROJECT_MAP_NAME);
    let project_text = std::fs::read_to_string(&project_path)
        .with_context(|| format!("read project map {}", project_path.display()))?;
    let project: ProjectMap =
        serde_json::from_str(&project_text).context("parse project.box.meta as JSON")?;
    if project.spec != PROJECT_MAP_SPEC {
        bail!("unsupported project map spec '{}'", project.spec);
    }

    let mut reports = Vec::new();
    reports.push(inspect_bundle_ref(
        dir,
        "SHARED",
        "shared",
        Vec::new(),
        &project.shared.meta,
        &project.shared.blob,
    ));

    for chapter in &project.chapters {
        reports.push(inspect_bundle_ref(
            dir,
            "CHAPTER",
            &chapter.title,
            chapter.dependencies.clone(),
            &chapter.meta,
            &chapter.blob,
        ));
    }

    Ok((project, reports))
}

fn inspect_bundle_ref(
    dir: &Path,
    kind: &str,
    name: &str,
    dependencies: Vec<String>,
    map_name: &str,
    blob_name: &str,
) -> ProjectBundleReport {
    let map_path = dir.join(map_name);
    let box_path = dir.join(blob_name);
    let inspect = inspect(&InspectOptions {
        map_path,
        box_path,
        json: false,
    })
    .map_err(|error| error.to_string());
    ProjectBundleReport {
        label: kind.to_string(),
        title: name.to_string(),
        dependencies,
        inspect,
    }
}

fn print_project_reports(
    w: &mut String,
    dir: &Path,
    project: &ProjectMap,
    bundles: &[ProjectBundleReport],
) {
    wln!(w, "blackbox-bundler inspect — {}", dir.display());
    wln!(w);
    let revision = project
        .revision
        .as_deref()
        .map(|value| format!("  revision: {value}"))
        .unwrap_or_default();
    wln!(
        w,
        "project: {} ({})  platform: {}  chapters: {}{revision}",
        project.scenario,
        project.title,
        project.platform,
        project.chapters.len()
    );
    wln!(w);

    for bundle in bundles {
        wln!(w, "{} {}", bundle.label, bundle.title);
        match &bundle.inspect {
            Ok(report) => {
                let bundle_id = report
                    .map
                    .bundle_id
                    .as_deref()
                    .unwrap_or(bundle.title.as_str());
                let deps = if bundle.dependencies.is_empty() {
                    String::new()
                } else {
                    format!("  dependencies: [{}]", bundle.dependencies.join(", "))
                };
                wln!(
                    w,
                    "  entries: {}  blob bytes: {}  bundle: {}{deps}",
                    report.entries.len(),
                    report.box_bytes,
                    bundle_id,
                );
                if !report.structural_errors.is_empty() {
                    for error in &report.structural_errors {
                        wln!(w, "  ERROR: {error}");
                    }
                } else {
                    wln!(w);
                    print_entry_table(w, report);
                    print_bundle_warnings(w, report);
                }
            }
            Err(error) => wln!(w, "  ERROR: {error}"),
        }
        wln!(w);
    }

    if bundles.iter().all(bundle_report_ok) {
        wln!(w, "result: ok");
    } else {
        wln!(w, "result: INVALID — project bundles do not match");
    }
}

fn entries_json(report: &InspectReport) -> serde_json::Value {
    serde_json::Value::Array(
        report
            .entries
            .iter()
            .map(|entry| {
                let status = match entry.status {
                    EntryStatus::Ok => "ok",
                    EntryStatus::Warn => "WARN",
                    EntryStatus::Error => "ERROR",
                };
                serde_json::json!({
                    "status": status,
                    "key": entry.key,
                    "codec": entry.map_codec,
                    "sniffed": entry.sniffed.unwrap_or("-"),
                    "bytes": entry.length,
                    "offset": entry.offset,
                    "note": entry.note,
                })
            })
            .collect(),
    )
}

fn codec_totals(report: &InspectReport) -> Vec<(String, u32, u64)> {
    let mut totals: std::collections::BTreeMap<&str, (u64, u32)> =
        std::collections::BTreeMap::new();
    for entry in &report.entries {
        let slot = totals.entry(entry.map_codec.as_str()).or_insert((0, 0));
        slot.0 += entry.length;
        slot.1 += 1;
    }
    totals
        .into_iter()
        .map(|(codec, (bytes, files))| (codec.to_string(), files, bytes))
        .collect()
}

fn codec_totals_json(report: &InspectReport) -> serde_json::Value {
    serde_json::Value::Array(
        codec_totals(report)
            .into_iter()
            .map(|(codec, files, bytes)| {
                serde_json::json!({
                    "codec": codec,
                    "files": files,
                    "bytes": bytes,
                })
            })
            .collect(),
    )
}

fn warnings_json(report: &InspectReport) -> Vec<String> {
    let warns = count_entry_warnings(report);
    if warns > 0 {
        vec![format!("{warns} entr(y/ies) with codec/sniff mismatch")]
    } else {
        Vec::new()
    }
}

fn single_report_json(options: &InspectOptions, report: &InspectReport) -> serde_json::Value {
    let dir = options
        .map_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .display()
        .to_string();
    serde_json::json!({
        "kind": "inspect",
        "dir": dir,
        "mapPath": options.map_path.display().to_string(),
        "boxPath": options.box_path.display().to_string(),
        "scenario": report.map.scenario,
        "scenarioTitle": "",
        "scenarioRevision": "",
        "platform": report.map.platform,
        "entryCount": report.entries.len(),
        "headerOk": report.header_ok && report.version_ok,
        "entries": entries_json(report),
        "codecTotals": codec_totals_json(report),
        "errors": report.structural_errors,
        "warnings": warnings_json(report),
        "result": if report_is_ok(report) { "ok" } else { "INVALID" },
        "bundles": [],
    })
}

fn project_report_json(
    dir: &Path,
    project: &ProjectMap,
    bundles: &[ProjectBundleReport],
) -> serde_json::Value {
    let mut total_entries = 0usize;
    let mut errors: Vec<String> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();

    let bundle_values: Vec<serde_json::Value> = bundles
        .iter()
        .map(|bundle| match &bundle.inspect {
            Ok(report) => {
                total_entries += report.entries.len();
                for warning in warnings_json(report) {
                    warnings.push(warning);
                }
                for error in &report.structural_errors {
                    errors.push(format!("{}: {error}", bundle.title));
                }
                serde_json::json!({
                    "kind": bundle.label,
                    "name": bundle.title,
                    "dependencies": bundle.dependencies,
                    "entryCount": report.entries.len(),
                    "blobBytes": report.box_bytes,
                    "bundleId": report.map.bundle_id,
                    "entries": entries_json(report),
                    "codecTotals": codec_totals_json(report),
                })
            }
            Err(error) => {
                errors.push(format!("{}: {error}", bundle.title));
                serde_json::json!({
                    "kind": bundle.label,
                    "name": bundle.title,
                    "dependencies": bundle.dependencies,
                    "entryCount": 0,
                    "blobBytes": 0,
                    "bundleId": serde_json::Value::Null,
                    "entries": [],
                    "codecTotals": [],
                    "error": error,
                })
            }
        })
        .collect();

    let all_ok = bundles.iter().all(bundle_report_ok);
    serde_json::json!({
        "kind": "inspect",
        "dir": dir.display().to_string(),
        "mapPath": "",
        "boxPath": "",
        "scenario": project.scenario,
        "scenarioTitle": project.title,
        "scenarioRevision": project.revision.clone().unwrap_or_default(),
        "platform": project.platform,
        "entryCount": total_entries,
        "headerOk": true,
        "entries": [],
        "codecTotals": [],
        "errors": errors,
        "warnings": warnings,
        "result": if all_ok { "ok" } else { "INVALID" },
        "bundles": bundle_values,
    })
}

fn error_json(message: &str) -> serde_json::Value {
    serde_json::json!({
        "kind": "inspect",
        "errors": [message],
        "result": "INVALID",
        "bundles": [],
        "entries": [],
        "codecTotals": [],
        "warnings": [],
    })
}

fn truncate(value: &str, max: usize) -> String {
    if value.len() <= max {
        return value.to_string();
    }
    format!("{}…", &value[..max.saturating_sub(1)])
}

pub fn parse_inspect_args(mut args: impl Iterator<Item = String>) -> Result<InspectOptions> {
    let mut dir: Option<PathBuf> = None;
    let mut map_path: Option<PathBuf> = None;
    let mut box_path: Option<PathBuf> = None;
    let mut json = false;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--json" => json = true,
            "--map" => {
                map_path = Some(PathBuf::from(args.next().context("--map requires a path")?));
            }
            "--box" => {
                box_path = Some(PathBuf::from(args.next().context("--box requires a path")?));
            }
            "--help" | "-h" => {
                print_inspect_help();
                std::process::exit(0);
            }
            value if value.starts_with('-') => bail!("unknown inspect flag: {value}"),
            value => {
                if dir.is_some() {
                    bail!("unexpected argument: {value}");
                }
                dir = Some(PathBuf::from(value));
            }
        }
    }

    let map_path = map_path.unwrap_or_else(|| {
        dir.as_ref()
            .map(|path| {
                let project_map = path.join(PROJECT_MAP_NAME);
                if project_map.is_file() {
                    project_map
                } else {
                    path.join("bundle.box.meta")
                }
            })
            .unwrap_or_else(|| PathBuf::from("dist/bundle/bundle.box.meta"))
    });

    let box_path = if let Some(path) = box_path {
        path
    } else if let Some(parent) = map_path.parent() {
        let map_text = std::fs::read_to_string(&map_path).ok();
        let blob_name = map_text
            .and_then(|text| serde_json::from_str::<BundleMap>(&text).ok())
            .map(|map| map.blob)
            .unwrap_or_else(|| "bundle.box".to_string());
        parent.join(blob_name)
    } else {
        PathBuf::from("bundle.box")
    };

    Ok(InspectOptions {
        map_path,
        box_path,
        json,
    })
}

pub fn print_inspect_help() {
    blackbox_output::Output::new(false).print(
        "\
blackbox-bundler inspect — verify bundle.box matches bundle.box.meta

USAGE:
    blackbox-bundler inspect [DIR]
    blackbox-bundler inspect --map MAP --box BOX

ARGUMENTS:
    DIR                    Directory with bundle.box + bundle.box.meta (default: dist/bundle)

OPTIONS:
    --map <PATH>           Path to bundle.box.meta
    --box <PATH>           Path to bundle.box (default: sibling named in map)
    -h, --help             Show this help
",
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sniffs_common_formats() {
        assert_eq!(sniff_codec(b"\x89PNG\r\n\x1a\n"), Some("png"));
        assert_eq!(sniff_codec(b"RIFF....WEBP"), Some("webp"));
        assert_eq!(sniff_codec(&[0xFF, 0xD8, 0xFF, 0x00]), Some("jpeg"));
        assert_eq!(sniff_codec(b"OggS"), Some("ogg"));
    }

    #[test]
    fn codec_matches_webp_key_png_path() {
        assert!(codec_matches("webp", "webp"));
        assert!(!codec_matches("webp", "png"));
    }
}
