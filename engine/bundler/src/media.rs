use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result, bail};
use tempfile::TempDir;

use crate::cache::CookCache;
use crate::format::EntryCodec;
use crate::platform::{EncodeAttempt, Platform};
use blackbox_bundler_cook::TextureCookProfile;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioKind {
    Music,
    Sfx,
}

#[derive(Debug, Clone)]
pub struct MediaTools {
    ffmpeg: PathBuf,
    cwebp: Option<PathBuf>,
    platform: Platform,
    skip_transcode: bool,
    cache: Option<Arc<Mutex<CookCache>>>,
    verbose: bool,
    worker_id: Option<usize>,
    out: Arc<blackbox_output::Output>,
    /// When true, cooked image/audio output omits EXIF, ID3, PNG text chunks, encoder tags, etc.
    strip_meta: bool,
}

impl MediaTools {
    pub fn new(
        ffmpeg: PathBuf,
        cwebp: PathBuf,
        platform: Platform,
        skip_transcode: bool,
        cache: Option<CookCache>,
        verbose: bool,
        out: Arc<blackbox_output::Output>,
    ) -> Result<Self> {
        if !skip_transcode {
            let status = Command::new(&ffmpeg)
                .arg("-version")
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status()
                .with_context(|| format!("run {} -version", ffmpeg.display()))?;
            if !status.success() {
                bail!("ffmpeg not available at {}", ffmpeg.display());
            }
        }

        let cwebp = probe_tool(&cwebp, &["-version"]);

        Ok(Self {
            ffmpeg,
            cwebp,
            platform,
            skip_transcode,
            cache: cache.map(|cache| Arc::new(Mutex::new(cache))),
            verbose,
            worker_id: None,
            out,
            strip_meta: true,
        })
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

    /// Shared output sink (used by the cook pipeline to route diagnostics).
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
            let bytes = std::fs::read(source)
                .with_context(|| format!("read texture {}", source.display()))?;
            return Ok((bytes, codec_for_texture(source)));
        }

        let profile_fp = profile.fingerprint();
        if let Some(cache) = &self.cache
            && let Some(cached) = cache.lock().expect("cook cache poisoned").lookup(
                source,
                "texture",
                source_relative,
                profile_fp,
            )?
        {
            if self.verbose {
                self.out.info(format!(
                    "[{}] cook cache hit {source_relative} ({})",
                    self.actor_label(),
                    cached.1.as_str()
                ));
            }
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
            let bytes = std::fs::read(source)
                .with_context(|| format!("read audio {}", source.display()))?;
            return Ok((bytes, codec_for_audio(source)));
        }

        let kind_label = match kind {
            AudioKind::Music => "music",
            AudioKind::Sfx => "sfx",
        };

        if let Some(cache) = &self.cache
            && let Some(cached) = cache.lock().expect("cook cache poisoned").lookup(
                source,
                kind_label,
                source_relative,
                0,
            )?
        {
            if self.verbose {
                self.out.info(format!(
                    "[{}] cook cache hit {source_relative} ({})",
                    self.actor_label(),
                    cached.1.as_str()
                ));
            }
            return Ok(cached);
        }

        let cooked = self.cook_audio(source, kind)?;
        if let Some(cache) = &self.cache {
            cache.lock().expect("cook cache poisoned").store(
                source,
                kind_label,
                source_relative,
                0,
                &cooked.0,
                cooked.1,
            )?;
        }
        Ok(cooked)
    }

    fn cook_texture(
        &self,
        source: &Path,
        profile: TextureCookProfile,
    ) -> Result<(Vec<u8>, EntryCodec)> {
        let quality = profile
            .webp_quality
            .unwrap_or_else(|| self.platform.texture_webp_quality());
        let filter = profile.resize.ffmpeg_filter();

        if let Some(filter) = filter {
            let temp = TempDir::new().context("create resize temp dir")?;
            let resized = temp.path().join("resized.png");
            if self.ffmpeg_resize(source, &filter, &resized)? {
                return self.encode_texture_resized(&resized, quality);
            }
            self.out.warn(format!(
                "[{}] resize failed for {}, encoding source size",
                self.platform.as_str(),
                source.display()
            ));
        }

        self.encode_texture_resized(source, quality)
    }

    fn encode_texture_resized(&self, source: &Path, quality: u8) -> Result<(Vec<u8>, EntryCodec)> {
        if let Some(cwebp) = &self.cwebp
            && let Some(result) = self.try_cwebp(source, cwebp, quality)
        {
            return Ok(result);
        }

        self.encode_with_attempts(source, self.platform.texture_attempts(), false, "texture")
    }

    fn ffmpeg_resize(&self, source: &Path, filter: &str, output: &Path) -> Result<bool> {
        let mut command = Command::new(&self.ffmpeg);
        command
            .arg("-y")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .arg("-i")
            .arg(source)
            .arg("-vf")
            .arg(filter);
        if self.strip_meta {
            command.args(ffmpeg_strip_meta_args());
        }
        let status = command.arg(output).status().with_context(|| {
            format!("run {} resize {}", self.ffmpeg.display(), source.display())
        })?;
        Ok(status.success() && output.is_file())
    }

    fn cook_audio(&self, source: &Path, kind: AudioKind) -> Result<(Vec<u8>, EntryCodec)> {
        let attempts = match kind {
            AudioKind::Music => self.platform.music_attempts(),
            AudioKind::Sfx => self.platform.sfx_attempts(),
        };
        self.encode_with_attempts(source, attempts, true, "audio")
    }

    fn encode_with_attempts(
        &self,
        source: &Path,
        attempts: &[EncodeAttempt],
        strip_video: bool,
        label: &str,
    ) -> Result<(Vec<u8>, EntryCodec)> {
        for (index, attempt) in attempts.iter().enumerate() {
            if let Some(result) = self.try_encode(source, attempt, strip_video) {
                if index > 0 {
                    self.out.info(format!(
                        "[{}] packed {} as {}",
                        self.platform.as_str(),
                        source.display(),
                        attempt.codec.as_str()
                    ));
                }
                return Ok(result);
            }
        }

        self.out.warn(format!(
            "[{}] ffmpeg {label} encode failed, packing raw {}",
            self.platform.as_str(),
            source.display()
        ));
        let codec = if label == "texture" {
            codec_for_texture(source)
        } else {
            codec_for_audio(source)
        };
        let bytes = if self.strip_meta
            && let Some(stripped) = self.strip_raw_source(source, label)
        {
            stripped
        } else {
            std::fs::read(source).with_context(|| format!("read {label} {}", source.display()))?
        };
        Ok((bytes, codec))
    }

    fn try_cwebp(&self, source: &Path, cwebp: &Path, quality: u8) -> Option<(Vec<u8>, EntryCodec)> {
        let temp = TempDir::new().ok()?;
        let output = temp.path().join("out.webp");
        let mut command = Command::new(cwebp);
        command.arg("-q").arg(quality.to_string());
        if self.strip_meta {
            command.arg("-metadata").arg("none");
        }
        let status = command
            .arg(source)
            .arg("-o")
            .arg(&output)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .ok()?;

        if !status.success() || !output.is_file() {
            return None;
        }

        let bytes = std::fs::read(&output).ok()?;
        Some((bytes, EntryCodec::Webp))
    }

    fn try_encode(
        &self,
        source: &Path,
        attempt: &EncodeAttempt,
        strip_video: bool,
    ) -> Option<(Vec<u8>, EntryCodec)> {
        let temp = TempDir::new().ok()?;
        let output = temp.path().join(attempt.output_name);
        let mut command = Command::new(&self.ffmpeg);
        command
            .arg("-y")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        if strip_video {
            command.arg("-vn");
        }
        command.arg("-i").arg(source).args(attempt.args);
        if self.strip_meta {
            command.args(ffmpeg_strip_meta_args());
            if strip_video {
                command.args(["-write_id3v1", "0"]);
            }
        }
        let status = command.arg(&output).status().ok()?;

        if !status.success() || !output.is_file() {
            return None;
        }

        let bytes = std::fs::read(&output).ok()?;
        Some((bytes, attempt.codec))
    }

    fn strip_raw_source(&self, source: &Path, label: &str) -> Option<Vec<u8>> {
        let temp = TempDir::new().ok()?;
        let extension = source
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let output = temp.path().join(format!("stripped.{extension}"));

        let mut command = Command::new(&self.ffmpeg);
        command
            .arg("-y")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .arg("-i")
            .arg(source)
            .args(ffmpeg_strip_meta_args());

        if label == "audio" {
            command.arg("-vn");
        }

        match label {
            "texture" => match extension.as_str() {
                "jpg" | "jpeg" => {
                    command.args(["-c:v", "mjpeg", "-q:v", "2"]);
                }
                "webp" => {
                    command.args(["-c:v", "libwebp", "-quality", "85"]);
                }
                _ => {
                    command.args(["-c:v", "png", "-compression_level", "9"]);
                }
            },
            "audio" => match extension.as_str() {
                "mp3" => {
                    command.args(["-c:a", "libmp3lame", "-b:a", "128k", "-write_id3v1", "0"]);
                }
                "ogg" => {
                    command.args(["-c:a", "copy"]);
                }
                "m4a" => {
                    command.args(["-c:a", "copy"]);
                }
                _ => {
                    command.args(["-c:a", "pcm_s16le"]);
                }
            },
            _ => return None,
        }

        let status = command.arg(&output).status().ok()?;
        if !status.success() || !output.is_file() {
            return None;
        }
        std::fs::read(&output).ok()
    }
}

fn ffmpeg_strip_meta_args() -> &'static [&'static str] {
    &[
        "-map_metadata",
        "-1",
        "-map_metadata:s:v",
        "-1",
        "-map_metadata:s:a",
        "-1",
        "-map_metadata:s:g",
        "-1",
        "-map_chapters",
        "-1",
    ]
}

fn should_cache_texture(codec: EntryCodec) -> bool {
    matches!(codec, EntryCodec::Webp | EntryCodec::Jpeg)
}

fn probe_tool(program: &Path, args: &[&str]) -> Option<PathBuf> {
    Command::new(program)
        .args(args)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .ok()
        .filter(|status| status.success())
        .map(|_| program.to_path_buf())
}

fn codec_for_texture(path: &Path) -> EntryCodec {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "webp" => EntryCodec::Webp,
        "jpg" | "jpeg" => EntryCodec::Jpeg,
        _ => EntryCodec::Png,
    }
}

fn codec_for_audio(path: &Path) -> EntryCodec {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "ogg" => EntryCodec::Ogg,
        "m4a" => EntryCodec::M4a,
        "wav" => EntryCodec::Wav,
        _ => EntryCodec::Mp3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_meta_enabled_by_default() {
        let tools = MediaTools::new(
            PathBuf::from("ffmpeg"),
            PathBuf::from("cwebp"),
            Platform::Web,
            true,
            None,
            false,
            Arc::new(blackbox_output::Output::new(false)),
        )
        .expect("media tools");
        assert!(tools.strip_meta);
    }

    #[test]
    fn ffmpeg_strip_meta_args_drop_container_and_stream_tags() {
        let args = ffmpeg_strip_meta_args();
        assert!(args.contains(&"-map_metadata"));
        assert!(args.contains(&"-1"));
        assert!(args.contains(&"-map_chapters"));
    }
}
