use std::collections::BTreeMap;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};

pub const BOX_MAGIC: &[u8; 4] = b"BBX\0";
pub const BOX_VERSION: u32 = 1;
pub const MAP_SPEC: &str = "com.blackbox.bundle.meta";
pub const MAP_FORMAT_VERSION: u32 = 1;
pub const ARCHIVE_BLOB_NAME: &str = "bundle.box";
pub const ARCHIVE_ZSTD_NAME: &str = "bundle.box.zst";
pub const PROJECT_MAP_SPEC: &str = "com.blackbox.bundle.project";
pub const PROJECT_MAP_NAME: &str = "project.box.meta";
pub const PROJECT_MAP_FORMAT_VERSION: u32 = 1;
pub const SHARED_BUNDLE_NAME: &str = "shared";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryCodec {
    Msgpack,
    Webp,
    Ogg,
    Png,
    Jpeg,
    Mp3,
    M4a,
    Wav,
}

impl EntryCodec {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Msgpack => "msgpack",
            Self::Webp => "webp",
            Self::Ogg => "ogg",
            Self::Png => "png",
            Self::Jpeg => "jpeg",
            Self::Mp3 => "mp3",
            Self::M4a => "m4a",
            Self::Wav => "wav",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchiveCompression {
    None,
    Zstd,
}

impl ArchiveCompression {
    pub fn parse(value: &str) -> Result<Self> {
        match value.to_ascii_lowercase().as_str() {
            "none" | "off" => Ok(Self::None),
            "zstd" => Ok(Self::Zstd),
            other => bail!("unknown archive compression '{other}' (expected zstd)"),
        }
    }

    pub fn as_map_value(self) -> Option<&'static str> {
        match self {
            Self::None => None,
            Self::Zstd => Some("zstd"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapEntry {
    pub offset: u64,
    pub length: u64,
    pub codec: EntryCodec,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BundleMap {
    pub spec: String,
    #[serde(rename = "formatVersion")]
    pub format_version: u32,
    pub platform: String,
    pub scenario: String,
    pub blob: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "bundleId")]
    pub bundle_id: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub dependencies: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "archiveCompression")]
    pub archive_compression: Option<String>,
    pub entries: BTreeMap<String, MapEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectMap {
    pub spec: String,
    #[serde(rename = "formatVersion")]
    pub format_version: u32,
    pub platform: String,
    pub scenario: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revision: Option<String>,
    pub shared: BundleRef,
    pub chapters: Vec<ChapterBundleRef>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BundleRef {
    pub meta: String,
    pub blob: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChapterBundleRef {
    pub id: String,
    pub title: String,
    pub meta: String,
    pub blob: String,
    pub dependencies: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct BundleWriteMeta<'a> {
    pub output_dir: &'a Path,
    pub bundle_name: &'a str,
    pub platform: &'a str,
    pub scenario_name: &'a str,
    pub bundle_id: Option<&'a str>,
    pub dependencies: &'a [String],
    pub archive_compression: ArchiveCompression,
}

#[derive(Default)]
pub struct BundleWriter {
    blob: Vec<u8>,
    entries: BTreeMap<String, MapEntry>,
}

impl BundleWriter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn append(&mut self, key: impl Into<String>, bytes: &[u8], codec: EntryCodec) {
        let key = key.into();
        let offset = align_offset(self.blob.len());
        if offset > self.blob.len() {
            self.blob.resize(offset, 0);
        }

        let entry = MapEntry {
            offset: offset as u64,
            length: bytes.len() as u64,
            codec,
        };
        self.blob.extend_from_slice(bytes);
        self.entries.insert(key, entry);
    }

    pub fn write(
        self,
        output_dir: &Path,
        platform: &str,
        scenario_name: &str,
        archive_compression: ArchiveCompression,
    ) -> Result<()> {
        self.write_named(BundleWriteMeta {
            output_dir,
            bundle_name: "bundle",
            platform,
            scenario_name,
            bundle_id: None,
            dependencies: &[],
            archive_compression,
        })
    }

    pub fn write_named(self, meta: BundleWriteMeta<'_>) -> Result<()> {
        let BundleWriteMeta {
            output_dir,
            bundle_name,
            platform,
            scenario_name,
            bundle_id,
            dependencies,
            archive_compression,
        } = meta;
        std::fs::create_dir_all(output_dir)
            .with_context(|| format!("create output dir {}", output_dir.display()))?;

        let box_path = output_dir.join(format!("{bundle_name}.box"));
        let map_path = output_dir.join(format!("{bundle_name}.box.meta"));

        let mut file = BufWriter::new(
            File::create(&box_path).with_context(|| format!("create {}", box_path.display()))?,
        );
        file.write_all(BOX_MAGIC)?;
        file.write_all(&BOX_VERSION.to_le_bytes())?;
        file.write_all(&[0u8; 8])?;
        file.write_all(&self.blob)?;
        file.flush()?;

        let zst_name = format!("{bundle_name}.box.zst");
        if archive_compression == ArchiveCompression::Zstd {
            let raw =
                std::fs::read(&box_path).with_context(|| format!("read {}", box_path.display()))?;
            let compressed =
                zstd::encode_all(raw.as_slice(), 3).context("zstd compress bundle.box")?;
            let zst_path = output_dir.join(&zst_name);
            std::fs::write(&zst_path, compressed)
                .with_context(|| format!("write {}", zst_path.display()))?;
        }

        let (blob, archive_compression_value) = match archive_compression {
            ArchiveCompression::None => (format!("{bundle_name}.box"), None),
            ArchiveCompression::Zstd => (zst_name, Some("zstd")),
        };

        let map = BundleMap {
            spec: MAP_SPEC.to_string(),
            format_version: MAP_FORMAT_VERSION,
            platform: platform.to_string(),
            scenario: scenario_name.to_string(),
            blob,
            bundle_id: bundle_id.map(str::to_string),
            dependencies: dependencies.to_vec(),
            archive_compression: archive_compression_value.map(str::to_string),
            entries: self.entries,
        };
        let map_text = serde_json::to_vec_pretty(&map).context("serialize bundle map")?;
        std::fs::write(&map_path, map_text)
            .with_context(|| format!("write {}", map_path.display()))?;

        Ok(())
    }
}

pub fn write_project_map(
    output_dir: &Path,
    platform: &str,
    scenario_name: &str,
    scenario_title: &str,
    scenario_revision: Option<&str>,
    shared_blob: &str,
    chapters: &[ChapterBundleRef],
) -> Result<()> {
    let map = ProjectMap {
        spec: PROJECT_MAP_SPEC.to_string(),
        format_version: PROJECT_MAP_FORMAT_VERSION,
        platform: platform.to_string(),
        scenario: scenario_name.to_string(),
        title: scenario_title.to_string(),
        revision: scenario_revision.map(str::to_string),
        shared: BundleRef {
            meta: format!("{SHARED_BUNDLE_NAME}.box.meta"),
            blob: shared_blob.to_string(),
        },
        chapters: chapters.to_vec(),
    };
    let map_text = serde_json::to_vec_pretty(&map).context("serialize project map")?;
    std::fs::write(output_dir.join(PROJECT_MAP_NAME), map_text)
        .with_context(|| format!("write {}", PROJECT_MAP_NAME))?;
    Ok(())
}

pub fn bundle_blob_name(bundle_name: &str, archive_compression: ArchiveCompression) -> String {
    match archive_compression {
        ArchiveCompression::None => format!("{bundle_name}.box"),
        ArchiveCompression::Zstd => format!("{bundle_name}.box.zst"),
    }
}

pub fn load_box_bytes(path: &Path, archive_compression: Option<&str>) -> Result<Vec<u8>> {
    let raw = std::fs::read(path).with_context(|| format!("read box {}", path.display()))?;
    if archive_compression == Some("zstd") {
        zstd::decode_all(raw.as_slice()).context("zstd decompress bundle.box.zst")
    } else {
        Ok(raw)
    }
}

fn align_offset(len: usize) -> usize {
    const ALIGN: usize = 4;
    len.div_ceil(ALIGN) * ALIGN
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_zstd_archive_when_requested() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut writer = BundleWriter::new();
        writer.append("content/scenario", b"hello", EntryCodec::Msgpack);

        writer
            .write(temp.path(), "web", "demo", ArchiveCompression::Zstd)
            .expect("write bundle");

        assert!(temp.path().join(ARCHIVE_BLOB_NAME).is_file());
        assert!(temp.path().join(ARCHIVE_ZSTD_NAME).is_file());
        let map_text = std::fs::read_to_string(temp.path().join("bundle.box.meta")).expect("meta");
        assert!(map_text.contains("\"archiveCompression\": \"zstd\""));
        assert!(map_text.contains("\"blob\": \"bundle.box.zst\""));
    }
}
