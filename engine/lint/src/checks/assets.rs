use std::path::Path;

use blackbox::content::AssetUsage;
use blackbox::is_editor_sidecar_src;

use crate::refs::collect_content_refs;
use crate::report::{LintIssue, LintReport};
use crate::rules::LintContext;

pub fn check_asset_files_rule(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(content) = ctx.content else {
        return;
    };
    check_asset_files(
        &LintContext {
            scenario_path: ctx.scenario_path,
            data_root: ctx.data_root,
            content: Some(content),
        },
        report,
    );
}

pub fn check_asset_files(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(content) = ctx.content else {
        return;
    };
    let refs = collect_content_refs(content);

    for (id, track) in &content.assets.music {
        if track.usage != AssetUsage::External && !refs.music_tracks.contains(id) {
            report.push(LintIssue::info(
                "unused-music",
                format!("music track '{id}' is never referenced"),
            ));
        }

        if let Some(issue) = editor_sidecar_issue(&track.src) {
            report.push(issue.with_context(format!("music:{id}")));
        } else if let Some(issue) =
            missing_file_issue("missing-music-file", &track.src, ctx.data_root)
        {
            report.push(issue.with_context(format!("music:{id}")));
        }
    }

    for (id, clip) in &content.assets.sfx {
        if clip.usage != AssetUsage::External && !refs.sfx_ids.contains(id) {
            report.push(LintIssue::info(
                "unused-sfx",
                format!("sfx '{id}' is never referenced"),
            ));
        }

        if let Some(issue) = editor_sidecar_issue(&clip.src) {
            report.push(issue.with_context(format!("sfx:{id}")));
        } else if let Some(issue) = missing_file_issue("missing-sfx-file", &clip.src, ctx.data_root)
        {
            report.push(issue.with_context(format!("sfx:{id}")));
        }
    }

    for (id, texture) in &content.assets.textures {
        if texture.usage != AssetUsage::External && !refs.texture_ids.contains(id) {
            report.push(LintIssue::info(
                "unused-texture",
                format!("texture '{id}' is never referenced"),
            ));
        }

        if let Some(issue) = editor_sidecar_issue(&texture.src) {
            report.push(issue.with_context(format!("texture:{id}")));
        } else if let Some(issue) =
            missing_file_issue("missing-texture-file", &texture.src, ctx.data_root)
        {
            report.push(issue.with_context(format!("texture:{id}")));
        }
    }
}

fn editor_sidecar_issue(src: &str) -> Option<LintIssue> {
    if !is_editor_sidecar_src(src) {
        return None;
    }

    Some(LintIssue::error(
        "editor-sidecar-src",
        format!(
            "asset src '{src}' points at editor-only .blackbox/ storage (e.g. trash or layout)"
        ),
    ))
}

fn missing_file_issue(code: &'static str, src: &str, data_root: &Path) -> Option<LintIssue> {
    let path = data_root.join(src);
    if path.is_file() {
        return None;
    }

    Some(LintIssue::error(
        code,
        format!("asset file not found: {}", path.display()),
    ))
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use blackbox::content::{AssetCatalog, AssetUsage, MusicTrack, TextureAsset};
    use blackbox_format::JsonFormat;

    use crate::report::LintReport;
    use crate::rules::LintContext;

    use super::check_asset_files;

    const FORMAT: JsonFormat = JsonFormat;

    #[test]
    fn external_usage_skips_unused_asset_info() {
        let scenario = r#"{
            "startNodeId": "start",
            "nodes": { "start": { "id": "start", "choices": [] } }
        }"#;
        let assets = r#"{
            "music": {
                "shell_theme": { "src": "music/theme.mp3", "loop": true, "usage": "external" }
            },
            "textures": {
                "shell_bg": { "src": "textures/bg.png", "usage": "external" }
            }
        }"#;

        let content = FORMAT
            .decode_bundle_str(
                &format!(
                    r#"{{"spec":"com.blackbox.scenario","formatVersion":1,{}}}"#,
                    scenario.trim_start_matches('{').trim_end_matches('}')
                ),
                r#"{"spec":"com.blackbox.items","formatVersion":1,"items":{}}"#,
                r#"{"spec":"com.blackbox.characters","formatVersion":1,"characters":{}}"#,
                &format!(
                    r#"{{"spec":"com.blackbox.assets.bundle","formatVersion":1,{}}}"#,
                    assets.trim_start_matches('{').trim_end_matches('}')
                ),
            )
            .expect("decode bundle");

        assert_eq!(
            content.assets.music["shell_theme"].usage,
            AssetUsage::External
        );
        assert_eq!(
            content.assets.textures["shell_bg"].usage,
            AssetUsage::External
        );

        let ctx = LintContext {
            scenario_path: Path::new("/tmp/scenario.json"),
            data_root: Path::new("/tmp"),
            content: Some(&content),
        };
        let mut report = LintReport::default();
        check_asset_files(&ctx, &mut report);

        assert!(
            !report
                .issues
                .iter()
                .any(|issue| issue.code.starts_with("unused-")),
            "external assets should not be reported as unused"
        );
    }

    #[test]
    fn asset_usage_defaults_to_internal() {
        let track = MusicTrack {
            src: "music/a.mp3".into(),
            r#loop: true,
            usage: Default::default(),
        };
        let texture = TextureAsset {
            src: "textures/a.png".into(),
            usage: Default::default(),
        };

        assert_eq!(track.usage, AssetUsage::Internal);
        assert_eq!(texture.usage, AssetUsage::Internal);
        assert!(AssetCatalog::default().music.is_empty());
    }
}
