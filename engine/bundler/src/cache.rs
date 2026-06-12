use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use sha2::{Digest, Sha256};

use super::format::EntryCodec;
use super::platform::Platform;

/// Bump when platform transcode profiles, cook schema, or resize pipeline change.
const COOK_CACHE_VERSION: u32 = 3;

#[derive(Debug, Clone)]
pub struct CookCache {
    root: PathBuf,
    platform: Platform,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct CookCacheMeta {
    version: u32,
    platform: String,
    kind: String,
    source: String,
    source_size: u64,
    #[serde(default)]
    source_modified: u64,
    codec: String,
    output_size: u64,
}

impl CookCache {
    pub fn new(root: PathBuf, platform: Platform) -> Self {
        Self { root, platform }
    }

    pub fn lookup(
        &self,
        source: &Path,
        kind: &str,
        source_relative: &str,
        profile_fp: u64,
    ) -> Result<Option<(Vec<u8>, EntryCodec)>> {
        let source_meta = fs::metadata(source)
            .with_context(|| format!("stat cook cache source {}", source.display()))?;
        let key = cache_key(
            self.platform,
            kind,
            source_relative,
            source_meta.len(),
            file_modified_secs(&source_meta),
            profile_fp,
        );
        let (bin_path, meta_path) = self.entry_paths(&key);

        if !bin_path.is_file() || !meta_path.is_file() {
            return Ok(None);
        }

        let meta_text = fs::read_to_string(&meta_path)
            .with_context(|| format!("read {}", meta_path.display()))?;
        let meta: CookCacheMeta =
            serde_json::from_str(&meta_text).context("parse cook cache metadata")?;

        if meta.version != COOK_CACHE_VERSION
            || meta.platform != self.platform.as_str()
            || meta.kind != kind
            || meta.source != source_relative
            || meta.source_size != source_meta.len()
            || meta.source_modified != file_modified_secs(&source_meta)
        {
            return Ok(None);
        }

        let bytes = fs::read(&bin_path).with_context(|| format!("read {}", bin_path.display()))?;
        let codec = parse_codec(&meta.codec)?;
        Ok(Some((bytes, codec)))
    }

    pub fn store(
        &self,
        source: &Path,
        kind: &str,
        source_relative: &str,
        profile_fp: u64,
        bytes: &[u8],
        codec: EntryCodec,
    ) -> Result<()> {
        let source_meta = fs::metadata(source)
            .with_context(|| format!("stat cook cache source {}", source.display()))?;
        let key = cache_key(
            self.platform,
            kind,
            source_relative,
            source_meta.len(),
            file_modified_secs(&source_meta),
            profile_fp,
        );
        let (bin_path, meta_path) = self.entry_paths(&key);
        if let Some(parent) = bin_path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("create cook cache dir {}", parent.display()))?;
        }

        fs::write(&bin_path, bytes).with_context(|| format!("write {}", bin_path.display()))?;

        let meta = CookCacheMeta {
            version: COOK_CACHE_VERSION,
            platform: self.platform.as_str().to_string(),
            kind: kind.to_string(),
            source: source_relative.to_string(),
            source_size: source_meta.len(),
            source_modified: file_modified_secs(&source_meta),
            codec: codec.as_str().to_string(),
            output_size: bytes.len() as u64,
        };
        let meta_text =
            serde_json::to_string_pretty(&meta).context("serialize cook cache metadata")?;
        fs::write(&meta_path, meta_text)
            .with_context(|| format!("write {}", meta_path.display()))?;
        Ok(())
    }

    fn entry_paths(&self, key: &str) -> (PathBuf, PathBuf) {
        let shard = &key[..2.min(key.len())];
        let dir = self.root.join(self.platform.as_str()).join(shard);
        (
            dir.join(format!("{key}.cooked")),
            dir.join(format!("{key}.json")),
        )
    }
}

fn cache_key(
    platform: Platform,
    kind: &str,
    source_relative: &str,
    source_size: u64,
    source_modified: u64,
    profile_fp: u64,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(COOK_CACHE_VERSION.to_le_bytes());
    hasher.update(platform.as_str().as_bytes());
    hasher.update([0]);
    hasher.update(kind.as_bytes());
    hasher.update([0]);
    hasher.update(source_relative.as_bytes());
    hasher.update([0]);
    hasher.update(source_size.to_le_bytes());
    hasher.update(source_modified.to_le_bytes());
    hasher.update(profile_fp.to_le_bytes());
    format!("{:x}", hasher.finalize())
}

fn file_modified_secs(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn parse_codec(value: &str) -> Result<EntryCodec> {
    match value {
        "msgpack" => Ok(EntryCodec::Msgpack),
        "webp" => Ok(EntryCodec::Webp),
        "png" => Ok(EntryCodec::Png),
        "jpeg" => Ok(EntryCodec::Jpeg),
        "ogg" => Ok(EntryCodec::Ogg),
        "mp3" => Ok(EntryCodec::Mp3),
        "m4a" => Ok(EntryCodec::M4a),
        "wav" => Ok(EntryCodec::Wav),
        other => anyhow::bail!("unknown cook cache codec '{other}'"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_key_is_stable_for_same_inputs() {
        let a = cache_key(Platform::Web, "texture", "textures/a.png", 100, 1, 42);
        let b = cache_key(Platform::Web, "texture", "textures/a.png", 100, 1, 42);
        assert_eq!(a, b);
        assert_ne!(
            a,
            cache_key(Platform::Web, "texture", "textures/a.png", 101, 1, 42)
        );
        assert_ne!(
            a,
            cache_key(Platform::Web, "texture", "textures/a.png", 100, 1, 99)
        );
    }
}
