use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use serde::Deserialize;

const COOK_SPEC: &str = "com.blackbox.bundle.cook";
const DEFAULT_COOK_FILE: &str = "bundle.cook.json";

pub const COOK_PLATFORMS: &[&str] = &["web", "ios", "android"];

/// Copy-friendly resolved texture cook settings (no heap).
#[derive(Debug, Clone, Copy, PartialEq, Default, Deserialize)]
pub struct TextureCookProfile {
    #[serde(default, rename = "webpQuality")]
    pub webp_quality: Option<u8>,
    #[serde(default)]
    pub resize: ResizeSpec,
}

impl TextureCookProfile {
    pub fn merge(&mut self, overlay: Self) {
        if let Some(q) = overlay.webp_quality {
            self.webp_quality = Some(q);
        }
        self.resize.merge(overlay.resize);
    }

    pub fn fingerprint(self) -> u64 {
        let mut h = 0x9E37_79B9_u64;
        if let Some(q) = self.webp_quality {
            h = hash_mix(h, q as u64);
        }
        h = hash_mix(h, self.resize.fingerprint());
        h
    }
}

/// Resize constraints applied before encode. All fields optional; merged deepest-wins.
#[derive(Debug, Clone, Copy, PartialEq, Default, Deserialize)]
pub struct ResizeSpec {
    #[serde(default)]
    pub scale: Option<f32>,
    #[serde(default, rename = "maxWidth")]
    pub max_width: Option<u32>,
    #[serde(default, rename = "maxHeight")]
    pub max_height: Option<u32>,
}

impl ResizeSpec {
    pub fn is_noop(self) -> bool {
        self.scale.is_none() && self.max_width.is_none() && self.max_height.is_none()
    }

    pub fn merge(&mut self, overlay: Self) {
        if let Some(v) = overlay.scale {
            self.scale = Some(v);
        }
        if let Some(v) = overlay.max_width {
            self.max_width = Some(v);
        }
        if let Some(v) = overlay.max_height {
            self.max_height = Some(v);
        }
    }

    pub fn fingerprint(self) -> u64 {
        let mut h = 0u64;
        if let Some(scale) = self.scale {
            h = hash_mix(h, scale.to_bits() as u64);
        }
        if let Some(w) = self.max_width {
            h = hash_mix(h, w as u64);
        }
        if let Some(hh) = self.max_height {
            h = hash_mix(h, hh as u64);
        }
        h
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CookValidationError {
    pub code: &'static str,
    pub message: String,
}

pub struct CookBook {
    platform_base: TextureCookProfile,
    patterns: Vec<(String, TextureCookProfile)>,
    files_src: HashMap<String, TextureCookProfile>,
    files_ref: HashMap<String, TextureCookProfile>,
}

impl CookBook {
    pub fn resolve_texture(&self, src: &str, refs: &[&str]) -> TextureCookProfile {
        let mut profile = self.platform_base;

        if let Some((_, pat)) = self
            .patterns
            .iter()
            .find(|(pattern, _)| glob_matches(src, pattern))
        {
            profile.merge(*pat);
        }

        if let Some(file) = self.files_src.get(src) {
            profile.merge(*file);
        }

        for reference in refs {
            if let Some(file) = self.files_ref.get(*reference) {
                profile.merge(*file);
            }
        }

        profile
    }
}

/// Read and parse a cook file. Returns `Ok(None)` when the path is absent.
pub fn read_cook_document(path: &Path) -> Result<Option<CookDocument>> {
    if !path.is_file() {
        return Ok(None);
    }

    let bytes = std::fs::read(path).with_context(|| format!("read {}", path.display()))?;
    let doc: CookDocument =
        serde_json::from_slice(&bytes).with_context(|| format!("parse {}", path.display()))?;

    if doc.spec != COOK_SPEC {
        bail!(
            "unsupported cook spec '{}' in {} (expected '{COOK_SPEC}')",
            doc.spec,
            path.display()
        );
    }

    Ok(Some(doc))
}

pub fn validate_cook_file(
    path: &Path,
    known_srcs: &BTreeSet<&str>,
    known_refs: &BTreeSet<&str>,
) -> Result<Option<Vec<CookValidationError>>> {
    let Some(doc) = read_cook_document(path)? else {
        return Ok(None);
    };
    Ok(Some(validate_cook_document(&doc, known_srcs, known_refs)))
}

pub fn validate_cook_document(
    doc: &CookDocument,
    known_srcs: &BTreeSet<&str>,
    known_refs: &BTreeSet<&str>,
) -> Vec<CookValidationError> {
    let mut errors = Vec::new();

    push_profile_error(&mut errors, "global", doc.global.texture);

    for (platform, scope) in &doc.platforms {
        if !COOK_PLATFORMS.contains(&platform.as_str()) {
            errors.push(CookValidationError {
                code: "unknown-cook-platform",
                message: format!(
                    "platforms.{platform}: unknown platform (expected one of {})",
                    COOK_PLATFORMS.join(", ")
                ),
            });
        }
        push_profile_error(&mut errors, &format!("platforms.{platform}"), scope.texture);
    }

    for entry in &doc.patterns {
        if let Some(err) = validate_pattern(&entry.pattern) {
            errors.push(err);
        }
        push_profile_error(
            &mut errors,
            &format!("patterns.{}", entry.pattern),
            entry.scope.texture,
        );
    }

    for (key, scope) in &doc.files {
        match classify_file_key(key) {
            CookFileKey::Src if !known_srcs.contains(key.as_str()) => {
                errors.push(CookValidationError {
                    code: "unknown-cook-file-src",
                    message: format!("files entry references unknown src '{key}'"),
                });
            }
            CookFileKey::Ref if !known_refs.contains(key.as_str()) => {
                errors.push(CookValidationError {
                    code: "unknown-cook-file-ref",
                    message: format!("files entry references unknown asset ref '{key}'"),
                });
            }
            _ => {}
        }
        push_profile_error(&mut errors, &format!("files.{key}"), scope.texture);
    }

    errors
}

pub fn load_cook_book(path: &Path, platform: &str) -> Result<Option<CookBook>> {
    let Some(doc) = read_cook_document(path)? else {
        return Ok(None);
    };
    Ok(Some(doc.into_book(platform)))
}

pub fn resolve_cook_path(scenario_dir: &Path, scenario_bytes: &[u8]) -> PathBuf {
    let cook_ref = read_cook_ref(scenario_bytes).unwrap_or_else(|| DEFAULT_COOK_FILE.to_string());
    scenario_dir.join(cook_ref)
}

#[derive(Debug, Deserialize)]
pub struct CookDocument {
    spec: String,
    #[serde(default)]
    global: CookScope,
    #[serde(default)]
    platforms: BTreeMap<String, CookScope>,
    #[serde(default)]
    patterns: Vec<CookPattern>,
    #[serde(default)]
    files: BTreeMap<String, CookScope>,
}

impl CookDocument {
    pub fn into_book(self, platform: &str) -> CookBook {
        let mut platform_base = TextureCookProfile::default();
        platform_base.merge(self.global.texture);

        if let Some(scope) = self.platforms.get(platform) {
            platform_base.merge(scope.texture);
        }

        let mut patterns = Vec::with_capacity(self.patterns.len());
        for entry in self.patterns {
            patterns.push((entry.pattern, entry.scope.texture));
        }
        patterns.sort_by(|a, b| {
            b.0.strip_suffix("/**")
                .unwrap_or(&b.0)
                .len()
                .cmp(&a.0.strip_suffix("/**").unwrap_or(&a.0).len())
        });

        let mut files_src = HashMap::new();
        let mut files_ref = HashMap::new();
        for (key, scope) in self.files {
            let profile = scope.texture;
            match classify_file_key(&key) {
                CookFileKey::Src => files_src.insert(key, profile),
                CookFileKey::Ref => files_ref.insert(key, profile),
            };
        }

        CookBook {
            platform_base,
            patterns,
            files_src,
            files_ref,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
struct CookScope {
    #[serde(default)]
    texture: TextureCookProfile,
}

#[derive(Debug, Deserialize)]
struct CookPattern {
    #[serde(rename = "match")]
    pattern: String,
    #[serde(flatten)]
    scope: CookScope,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CookFileKey {
    Src,
    Ref,
}

fn classify_file_key(key: &str) -> CookFileKey {
    if key.contains('/') {
        CookFileKey::Src
    } else {
        CookFileKey::Ref
    }
}

fn read_cook_ref(scenario_bytes: &[u8]) -> Option<String> {
    let value: serde_json::Value = serde_json::from_slice(scenario_bytes).ok()?;
    value
        .get("cookRef")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
}

fn push_profile_error(
    errors: &mut Vec<CookValidationError>,
    label: &str,
    profile: TextureCookProfile,
) {
    if let Some(err) = validate_profile(label, profile) {
        errors.push(err);
    }
}

fn validate_pattern(pattern: &str) -> Option<CookValidationError> {
    if pattern.contains('*') && !pattern.ends_with("/**") {
        return Some(CookValidationError {
            code: "invalid-cook-pattern",
            message: format!(
                "pattern '{pattern}': only /** suffix globs are supported (e.g. textures/**)"
            ),
        });
    }

    None
}

fn validate_profile(label: &str, profile: TextureCookProfile) -> Option<CookValidationError> {
    if let Some(scale) = profile.resize.scale
        && !(scale > 0.0 && scale <= 4.0)
    {
        return Some(CookValidationError {
            code: "invalid-cook-resize",
            message: format!("'{label}': resize.scale must be in (0, 4], got {scale}"),
        });
    }

    if let Some(w) = profile.resize.max_width
        && w == 0
    {
        return Some(CookValidationError {
            code: "invalid-cook-resize",
            message: format!("'{label}': resize.maxWidth must be > 0"),
        });
    }

    if let Some(h) = profile.resize.max_height
        && h == 0
    {
        return Some(CookValidationError {
            code: "invalid-cook-resize",
            message: format!("'{label}': resize.maxHeight must be > 0"),
        });
    }

    if let Some(q) = profile.webp_quality
        && q > 100
    {
        return Some(CookValidationError {
            code: "invalid-cook-quality",
            message: format!("'{label}': webpQuality must be 0..=100"),
        });
    }

    None
}

fn glob_matches(path: &str, pattern: &str) -> bool {
    if path == pattern {
        return true;
    }

    let Some(prefix) = pattern.strip_suffix("/**") else {
        return false;
    };

    if prefix.is_empty() {
        return true;
    }

    path.starts_with(prefix)
        && path
            .as_bytes()
            .get(prefix.len())
            .is_some_and(|byte| *byte == b'/')
}

fn hash_mix(seed: u64, value: u64) -> u64 {
    seed.wrapping_mul(0x517c_c1b7_2722_0a95).wrapping_add(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn glob_matches_backgrounds() {
        assert!(glob_matches(
            "textures/backgrounds/scene.png",
            "textures/backgrounds/**"
        ));
        assert!(!glob_matches(
            "textures/icons/icon.png",
            "textures/backgrounds/**"
        ));
    }

    #[test]
    fn merge_order_platform_then_pattern_then_file() {
        let doc: CookDocument = serde_json::from_value(serde_json::json!({
            "spec": "com.blackbox.bundle.cook",
            "global": { "texture": { "webpQuality": 70 } },
            "platforms": { "web": { "texture": { "webpQuality": 80 } } },
            "patterns": [{
                "match": "textures/backgrounds/**",
                "texture": { "resize": { "maxWidth": 1280 } }
            }],
            "files": {
                "background_chapel": { "texture": { "resize": { "scale": 0.5 } } }
            }
        }))
        .expect("json");

        let book = doc.into_book("web");
        let profile =
            book.resolve_texture("textures/backgrounds/scene.png", &["background_chapel"]);

        assert_eq!(profile.webp_quality, Some(80));
        assert_eq!(profile.resize.max_width, Some(1280));
        assert_eq!(profile.resize.scale, Some(0.5));
    }

    #[test]
    fn validate_document_checks_all_scopes_without_platform_merge() {
        let doc: CookDocument = serde_json::from_value(serde_json::json!({
            "spec": "com.blackbox.bundle.cook",
            "global": { "texture": { "webpQuality": 120 } },
            "platforms": { "desktop": { "texture": { "resize": { "scale": 0.5 } } } },
            "patterns": [{
                "match": "textures/*.png",
                "texture": { "resize": { "maxWidth": 1280 } }
            }],
            "files": {
                "missing_ref": { "texture": { "webpQuality": 80 } }
            }
        }))
        .expect("json");

        let known_srcs = BTreeSet::new();
        let known_refs = BTreeSet::new();
        let errors = validate_cook_document(&doc, &known_srcs, &known_refs);
        let codes: BTreeSet<_> = errors.iter().map(|err| err.code).collect();

        assert!(codes.contains("invalid-cook-quality"));
        assert!(codes.contains("unknown-cook-platform"));
        assert!(codes.contains("invalid-cook-pattern"));
        assert!(codes.contains("unknown-cook-file-ref"));
    }

    #[test]
    fn resize_max_box_is_not_noop() {
        let resize = ResizeSpec {
            scale: None,
            max_width: Some(1280),
            max_height: Some(720),
        };
        assert!(!resize.is_noop());
    }
}
