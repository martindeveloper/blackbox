use anyhow::{Result, bail};

use blackbox_bundler_cook::COOK_PLATFORMS;

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

    pub fn texture_attempts(self) -> &'static [EncodeAttempt] {
        match self {
            Self::Web => WEB_TEXTURE,
            Self::Ios => IOS_TEXTURE,
            Self::Android => ANDROID_TEXTURE,
        }
    }

    pub fn music_attempts(self) -> &'static [EncodeAttempt] {
        match self {
            Self::Web | Self::Android => OPUS_MUSIC,
            Self::Ios => AAC_MUSIC,
        }
    }

    pub fn sfx_attempts(self) -> &'static [EncodeAttempt] {
        match self {
            Self::Web => OPUS_SFX_WEB,
            Self::Android => OPUS_SFX_ANDROID,
            Self::Ios => AAC_SFX,
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
pub struct EncodeAttempt {
    pub args: &'static [&'static str],
    pub output_name: &'static str,
    pub codec: EntryCodec,
}

impl EncodeAttempt {
    const fn new(
        args: &'static [&'static str],
        output_name: &'static str,
        codec: EntryCodec,
    ) -> Self {
        Self {
            args,
            output_name,
            codec,
        }
    }
}

const WEB_TEXTURE: &[EncodeAttempt] = &[
    EncodeAttempt::new(
        &["-c:v", "libwebp", "-quality", "85"],
        "out.webp",
        EntryCodec::Webp,
    ),
    EncodeAttempt::new(
        &["-c:v", "png", "-compression_level", "9"],
        "out.png",
        EntryCodec::Png,
    ),
];

const IOS_TEXTURE: &[EncodeAttempt] = &[
    EncodeAttempt::new(
        &["-c:v", "libwebp", "-quality", "90"],
        "out.webp",
        EntryCodec::Webp,
    ),
    EncodeAttempt::new(&["-c:v", "mjpeg", "-q:v", "3"], "out.jpg", EntryCodec::Jpeg),
    EncodeAttempt::new(
        &["-c:v", "png", "-compression_level", "9"],
        "out.png",
        EntryCodec::Png,
    ),
];

const ANDROID_TEXTURE: &[EncodeAttempt] = &[
    EncodeAttempt::new(
        &["-c:v", "libwebp", "-quality", "80"],
        "out.webp",
        EntryCodec::Webp,
    ),
    EncodeAttempt::new(
        &["-c:v", "png", "-compression_level", "9"],
        "out.png",
        EntryCodec::Png,
    ),
];

const OPUS_MUSIC: &[EncodeAttempt] = &[
    EncodeAttempt::new(
        &["-c:a", "libopus", "-b:a", "96k", "-vbr", "on"],
        "out.ogg",
        EntryCodec::Ogg,
    ),
    EncodeAttempt::new(
        &["-c:a", "libmp3lame", "-b:a", "128k"],
        "out.mp3",
        EntryCodec::Mp3,
    ),
];

const AAC_MUSIC: &[EncodeAttempt] = &[
    EncodeAttempt::new(&["-c:a", "aac", "-b:a", "128k"], "out.m4a", EntryCodec::M4a),
    EncodeAttempt::new(
        &["-c:a", "libmp3lame", "-b:a", "128k"],
        "out.mp3",
        EntryCodec::Mp3,
    ),
];

const OPUS_SFX_WEB: &[EncodeAttempt] = &[
    EncodeAttempt::new(
        &["-c:a", "libopus", "-b:a", "64k", "-vbr", "on"],
        "out.ogg",
        EntryCodec::Ogg,
    ),
    EncodeAttempt::new(
        &["-c:a", "libmp3lame", "-b:a", "96k"],
        "out.mp3",
        EntryCodec::Mp3,
    ),
];

const OPUS_SFX_ANDROID: &[EncodeAttempt] = &[
    EncodeAttempt::new(
        &["-c:a", "libopus", "-b:a", "48k", "-vbr", "on"],
        "out.ogg",
        EntryCodec::Ogg,
    ),
    EncodeAttempt::new(
        &["-c:a", "libmp3lame", "-b:a", "96k"],
        "out.mp3",
        EntryCodec::Mp3,
    ),
];

const AAC_SFX: &[EncodeAttempt] = &[
    EncodeAttempt::new(&["-c:a", "aac", "-b:a", "96k"], "out.m4a", EntryCodec::M4a),
    EncodeAttempt::new(
        &["-c:a", "libmp3lame", "-b:a", "96k"],
        "out.mp3",
        EntryCodec::Mp3,
    ),
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
        assert_eq!(Platform::Ios.music_attempts()[0].codec, EntryCodec::M4a);
    }
}
