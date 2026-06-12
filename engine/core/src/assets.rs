use rustc_hash::FxHashMap as HashMap;
use std::sync::Arc;

use crate::content::{AssetCatalog, ChoiceContent};
use crate::view::{MusicCue, ResolvedAssetCatalog, SfxCue, TextureCue};

/// Returns true when `src` points at editor-only storage under `.blackbox/` (layout, trash, etc.).
pub fn is_editor_sidecar_src(src: &str) -> bool {
    let normalized = src.replace('\\', "/");
    normalized == ".blackbox"
        || normalized.starts_with(".blackbox/")
        || normalized.contains("/.blackbox/")
}

impl AssetCatalog {
    pub fn src_paths(&self) -> impl Iterator<Item = &str> {
        self.textures
            .values()
            .map(|texture| texture.src.as_str())
            .chain(self.sfx.values().map(|clip| clip.src.as_str()))
            .chain(self.music.values().map(|track| track.src.as_str()))
    }

    pub fn ref_ids(&self) -> impl Iterator<Item = &str> {
        self.textures
            .keys()
            .map(String::as_str)
            .chain(self.sfx.keys().map(String::as_str))
            .chain(self.music.keys().map(String::as_str))
    }

    pub fn src_for_ref(&self, asset_ref: &str) -> Option<String> {
        self.textures
            .get(asset_ref)
            .map(|texture| texture.src.clone())
            .or_else(|| self.music.get(asset_ref).map(|track| track.src.clone()))
            .or_else(|| self.sfx.get(asset_ref).map(|clip| clip.src.clone()))
    }

    pub fn build_resolved_cues(&mut self) {
        let mut music_cues =
            HashMap::with_capacity_and_hasher(self.music.len(), Default::default());
        for (ref_id, track) in &self.music {
            music_cues.insert(
                ref_id.clone(),
                Arc::new(MusicCue {
                    ref_id: ref_id.clone(),
                    src: track.src.clone(),
                    r#loop: track.r#loop,
                }),
            );
        }

        let mut sfx_cues = HashMap::with_capacity_and_hasher(self.sfx.len(), Default::default());
        for (ref_id, clip) in &self.sfx {
            sfx_cues.insert(
                ref_id.clone(),
                Arc::new(SfxCue {
                    ref_id: ref_id.clone(),
                    src: clip.src.clone(),
                }),
            );
        }

        let mut texture_cues =
            HashMap::with_capacity_and_hasher(self.textures.len(), Default::default());
        for (ref_id, texture) in &self.textures {
            texture_cues.insert(
                ref_id.clone(),
                Arc::new(TextureCue {
                    ref_id: ref_id.clone(),
                    src: texture.src.clone(),
                }),
            );
        }

        self.resolved = ResolvedAssetCatalog {
            music_cues,
            sfx_cues,
            texture_cues,
        };
    }

    pub fn resolve_music(&self, ref_id: &str) -> Option<Arc<MusicCue>> {
        self.resolved.music_cues.get(ref_id).cloned()
    }

    pub fn resolve_sfx(&self, ref_id: &str) -> Option<Arc<SfxCue>> {
        self.resolved.sfx_cues.get(ref_id).cloned()
    }

    pub fn resolve_texture(&self, ref_id: &str) -> Option<Arc<TextureCue>> {
        self.resolved.texture_cues.get(ref_id).cloned()
    }

    pub fn resolve_sfx_for_choice(&self, choice: &ChoiceContent) -> Option<Arc<SfxCue>> {
        let ref_id = choice
            .presentation
            .sfx
            .as_deref()
            .or(self.default_choice_sfx.as_deref())?;
        self.resolve_sfx(ref_id)
    }
}

#[cfg(test)]
mod tests {
    use super::is_editor_sidecar_src;
    use crate::content::{AssetCatalog, MusicTrack, SfxClip, TextureAsset};

    #[test]
    fn src_for_ref_resolves_texture_music_and_sfx() {
        let mut assets = AssetCatalog::default();
        assets.textures.insert(
            "bg".into(),
            TextureAsset {
                src: "textures/bg.png".into(),
                usage: Default::default(),
            },
        );
        assets.music.insert(
            "theme".into(),
            MusicTrack {
                src: "music/theme.mp3".into(),
                r#loop: true,
                usage: Default::default(),
            },
        );
        assets.sfx.insert(
            "click".into(),
            SfxClip {
                src: "sfx/click.wav".into(),
                usage: Default::default(),
            },
        );

        assert_eq!(assets.src_for_ref("bg").as_deref(), Some("textures/bg.png"));
        assert_eq!(
            assets.src_for_ref("theme").as_deref(),
            Some("music/theme.mp3")
        );
        assert_eq!(
            assets.src_for_ref("click").as_deref(),
            Some("sfx/click.wav")
        );
        assert!(assets.src_for_ref("missing").is_none());
    }

    #[test]
    fn editor_sidecar_src_detects_blackbox_paths() {
        assert!(is_editor_sidecar_src(".blackbox/trash/foo.png"));
        assert!(is_editor_sidecar_src(".blackbox/trash.json"));
        assert!(is_editor_sidecar_src("demo/.blackbox/layout.json"));
        assert!(!is_editor_sidecar_src("textures/backgrounds/scene.png"));
        assert!(!is_editor_sidecar_src("music/theme.mp3"));
    }
}
