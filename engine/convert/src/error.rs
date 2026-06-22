use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum ConvertError {
    #[error("unsupported input format: {0}")]
    UnsupportedInput(PathBuf),
    #[error("invalid option: {0}")]
    InvalidOption(String),
    #[error("input contains no audio track")]
    NoAudioTrack,
    #[error("audio track has no sample rate")]
    MissingSampleRate,
    #[error("audio track has unsupported channel count: {0}")]
    UnsupportedChannels(usize),
    #[error("audio decode failed: {0}")]
    Decode(String),
    #[error("audio encode failed: {0}")]
    Encode(String),
    #[error("container write failed: {0}")]
    Container(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Image(#[from] image::ImageError),
}

pub type Result<T> = std::result::Result<T, ConvertError>;
