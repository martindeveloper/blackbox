use std::path::Path;
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use blackbox_bundler_cook::TextureCookProfile;
use blackbox_convert::{
    AudioOptions, ImageOptions, Resize, convert_audio_to_vec, convert_image_to_vec,
};

use crate::cache::CookCache;
use crate::format::EntryCodec;
use crate::platform::{AudioEncoding, Platform};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioKind {
    Music,
    Sfx,
}

#[derive(Debug, Clone)]
pub struct MediaTools {
    platform: Platform,
    skip_transcode: bool,
    cache: Option<Arc<Mutex<CookCache>>>,
    verbose: bool,
    worker_id: Option<usize>,
    out: Arc<blackbox_output::Output>,
}

impl MediaTools {
    pub fn new(
        platform: Platform,
        skip_transcode: bool,
        cache: Option<CookCache>,
        verbose: bool,
        out: Arc<blackbox_output::Output>,
    ) -> Self {
        Self {
            platform,
            skip_transcode,
            cache: cache.map(|cache| Arc::new(Mutex::new(cache))),
            verbose,
            worker_id: None,
            out,
        }
    }

    pub fn with_worker_id(&self, worker_id: usize) -> Self {
        let mut tools = self.clone();
        tools.worker_id = Some(worker_id);
        tools
    }

    pub fn actor_label(&self) -> String {
        self.worker_id
            .map(|id| format!("w{id}"))
            .unwrap_or_else(|| "main".to_string())
    }

    pub fn is_verbose(&self) -> bool {
        self.verbose
    }

    pub fn out(&self) -> &blackbox_output::Output {
        &self.out
    }

    pub fn prepare_texture(
        &self,
        source: &Path,
        source_relative: &str,
        profile: TextureCookProfile,
    ) -> Result<(Vec<u8>, EntryCodec)> {
        if self.skip_transcode {
            return read_source(source, "texture", codec_for_texture(source));
        }

        let profile_fp = profile.fingerprint();
        if let Some(cached) = self.cache_lookup(source, "texture", source_relative, profile_fp)? {
            return Ok(cached);
        }

        let cooked = self.cook_texture(source, profile)?;
        if let Some(cache) = &self.cache
            && should_cache_texture(cooked.1)
        {
            cache.lock().expect("cook cache poisoned").store(
                source,
                "texture",
                source_relative,
                profile_fp,
                &cooked.0,
                cooked.1,
            )?;
        }
        Ok(cooked)
    }

    pub fn prepare_audio(
        &self,
        source: &Path,
        source_relative: &str,
        kind: AudioKind,
    ) -> Result<(Vec<u8>, EntryCodec)> {
        if self.skip_transcode {
            return read_source(source, "audio", codec_for_audio(source));
        }

        let label = match kind {
            AudioKind::Music => "music",
            AudioKind::Sfx => "sfx",
        };
        if let Some(cached) = self.cache_lookup(source, label, source_relative, 0)? {
            return Ok(cached);
        }

        let encoding = match kind {
            AudioKind::Music => self.platform.music_encoding(),
            AudioKind::Sfx => self.platform.sfx_encoding(),
        };
        let cooked = self.cook_audio(source, encoding)?;
        if let Some(cache) = &self.cache {
            cache.lock().expect("cook cache poisoned").store(
                source,
                label,
                source_relative,
                0,
                &cooked.0,
                cooked.1,
            )?;
        }
        Ok(cooked)
    }

    fn cache_lookup(
        &self,
        source: &Path,
        kind: &str,
        source_relative: &str,
        profile: u64,
    ) -> Result<Option<(Vec<u8>, EntryCodec)>> {
        let Some(cache) = &self.cache else {
            return Ok(None);
        };
        let cached = cache.lock().expect("cook cache poisoned").lookup(
            source,
            kind,
            source_relative,
            profile,
        )?;
        if cached.is_some() && self.verbose {
            self.out.info(format!(
                "[{}] cook cache hit {source_relative}",
                self.actor_label()
            ));
        }
        Ok(cached)
    }

    fn cook_texture(
        &self,
        source: &Path,
        profile: TextureCookProfile,
    ) -> Result<(Vec<u8>, EntryCodec)> {
        let quality = profile
            .webp_quality
            .unwrap_or_else(|| self.platform.texture_webp_quality());
        let resize = Resize {
            scale: profile.resize.scale,
            max_width: profile.resize.max_width,
            max_height: profile.resize.max_height,
        };

        for encoding in self.platform.texture_encodings() {
            let options = ImageOptions {
                format: encoding.format,
                quality,
                resize,
            };
            match convert_image_to_vec(source, options) {
                Ok(bytes) => return Ok((bytes, encoding.codec)),
                Err(error) => self.out.warn(format!(
                    "[{}] {} texture encode failed for {}: {error}",
                    self.platform.as_str(),
                    encoding.codec.as_str(),
                    source.display()
                )),
            }
        }

        self.out.warn(format!(
            "[{}] texture conversion failed, packing raw {}",
            self.platform.as_str(),
            source.display()
        ));
        read_source(source, "texture", codec_for_texture(source))
    }

    fn cook_audio(&self, source: &Path, encoding: AudioEncoding) -> Result<(Vec<u8>, EntryCodec)> {
        match convert_audio_to_vec(
            source,
            AudioOptions {
                codec: encoding.codec,
                bitrate: encoding.bitrate,
            },
        ) {
            Ok(bytes) => Ok((bytes, encoding.entry_codec)),
            Err(error) => {
                self.out.warn(format!(
                    "[{}] audio conversion failed for {}: {error}; packing raw source",
                    self.platform.as_str(),
                    source.display()
                ));
                read_source(source, "audio", codec_for_audio(source))
            }
        }
    }
}

fn read_source(source: &Path, label: &str, codec: EntryCodec) -> Result<(Vec<u8>, EntryCodec)> {
    let bytes =
        std::fs::read(source).with_context(|| format!("read {label} {}", source.display()))?;
    Ok((bytes, codec))
}

fn should_cache_texture(codec: EntryCodec) -> bool {
    matches!(codec, EntryCodec::Webp | EntryCodec::Jpeg)
}

fn codec_for_texture(path: &Path) -> EntryCodec {
    match extension(path).as_str() {
        "webp" => EntryCodec::Webp,
        "jpg" | "jpeg" => EntryCodec::Jpeg,
        _ => EntryCodec::Png,
    }
}

fn codec_for_audio(path: &Path) -> EntryCodec {
    match extension(path).as_str() {
        "ogg" => EntryCodec::Ogg,
        "m4a" | "mp4" => EntryCodec::M4a,
        "wav" => EntryCodec::Wav,
        _ => EntryCodec::Mp3,
    }
}

fn extension(path: &Path) -> String {
    path.extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skip_transcode_keeps_source_codec() {
        let tools = MediaTools::new(
            Platform::Web,
            true,
            None,
            false,
            Arc::new(blackbox_output::Output::new(false)),
        );
        assert!(tools.skip_transcode);
    }
}
