use anyhow::{Result, bail};

use blackbox_bundler_cook::COOK_PLATFORMS;
use blackbox_convert::{AudioCodec, ImageFormat};

use super::format::EntryCodec;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Web,
    Ios,
    Android,
}

impl Platform {
    pub fn parse(value: &str) -> Result<Self> {
        match value.to_ascii_lowercase().as_str() {
            "web" => Ok(Self::Web),
            "ios" => Ok(Self::Ios),
            "android" => Ok(Self::Android),
            _ => bail!(
                "unknown platform '{value}' (expected {})",
                COOK_PLATFORMS.join(", ")
            ),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Web => "web",
            Self::Ios => "ios",
            Self::Android => "android",
        }
    }

    pub fn texture_encodings(self) -> &'static [TextureEncoding] {
        match self {
            Self::Web => WEB_TEXTURE,
            Self::Ios => IOS_TEXTURE,
            Self::Android => ANDROID_TEXTURE,
        }
    }

    pub fn music_encoding(self) -> AudioEncoding {
        match self {
            Self::Web | Self::Android => {
                AudioEncoding::new(AudioCodec::Opus, 96_000, EntryCodec::Ogg)
            }
            Self::Ios => AudioEncoding::new(AudioCodec::Aac, 128_000, EntryCodec::M4a),
        }
    }

    pub fn sfx_encoding(self) -> AudioEncoding {
        match self {
            Self::Web => AudioEncoding::new(AudioCodec::Opus, 64_000, EntryCodec::Ogg),
            Self::Android => AudioEncoding::new(AudioCodec::Opus, 48_000, EntryCodec::Ogg),
            Self::Ios => AudioEncoding::new(AudioCodec::Aac, 96_000, EntryCodec::M4a),
        }
    }

    pub fn texture_webp_quality(self) -> u8 {
        match self {
            Self::Web => 85,
            Self::Ios => 90,
            Self::Android => 80,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct TextureEncoding {
    pub format: ImageFormat,
    pub codec: EntryCodec,
}

impl TextureEncoding {
    const fn new(format: ImageFormat, codec: EntryCodec) -> Self {
        Self { format, codec }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct AudioEncoding {
    pub codec: AudioCodec,
    pub bitrate: u32,
    pub entry_codec: EntryCodec,
}

impl AudioEncoding {
    const fn new(codec: AudioCodec, bitrate: u32, entry_codec: EntryCodec) -> Self {
        Self {
            codec,
            bitrate,
            entry_codec,
        }
    }
}

const WEB_TEXTURE: &[TextureEncoding] = &[
    TextureEncoding::new(ImageFormat::Webp, EntryCodec::Webp),
    TextureEncoding::new(ImageFormat::Png, EntryCodec::Png),
];

const IOS_TEXTURE: &[TextureEncoding] = &[
    TextureEncoding::new(ImageFormat::Webp, EntryCodec::Webp),
    TextureEncoding::new(ImageFormat::Jpeg, EntryCodec::Jpeg),
    TextureEncoding::new(ImageFormat::Png, EntryCodec::Png),
];

const ANDROID_TEXTURE: &[TextureEncoding] = &[
    TextureEncoding::new(ImageFormat::Webp, EntryCodec::Webp),
    TextureEncoding::new(ImageFormat::Png, EntryCodec::Png),
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_platform_names() {
        assert_eq!(Platform::parse("web").expect("web"), Platform::Web);
        assert_eq!(Platform::parse("IOS").expect("ios"), Platform::Ios);
        assert_eq!(
            Platform::parse("android").expect("android"),
            Platform::Android
        );
        assert!(Platform::parse("desktop").is_err());
    }

    #[test]
    fn platform_names_match_cook_registry() {
        use blackbox_bundler_cook::COOK_PLATFORMS;

        for platform in [Platform::Web, Platform::Ios, Platform::Android] {
            assert!(COOK_PLATFORMS.contains(&platform.as_str()));
        }
    }

    #[test]
    fn ios_prefers_aac_for_music() {
        assert_eq!(Platform::Ios.music_encoding().entry_codec, EntryCodec::M4a);
    }
}
