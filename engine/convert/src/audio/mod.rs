mod decode;
mod formats;
mod pipeline;

use std::fs::File;
use std::io::{BufWriter, Cursor, Seek, Write};
use std::path::Path;

use crate::error::{ConvertError, Result};

use self::decode::AudioSource;
use self::formats::{AacSink, OpusSink, WavSink};
use self::pipeline::run;

pub(crate) const TARGET_RATE: u32 = 48_000;
const BUFFER_SIZE: usize = 256 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioCodec {
    Opus,
    Aac,
    Wav,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AudioOptions {
    pub codec: AudioCodec,
    pub bitrate: u32,
}

pub fn convert_audio(input: &Path, output: &Path, options: AudioOptions) -> Result<()> {
    let file = BufWriter::with_capacity(BUFFER_SIZE, File::create(output)?);
    convert_to_writer(input, file, options)
}

pub fn convert_audio_to_vec(input: &Path, options: AudioOptions) -> Result<Vec<u8>> {
    let mut writer = Cursor::new(Vec::new());
    convert_to_writer(input, &mut writer, options)?;
    Ok(writer.into_inner())
}

fn convert_to_writer<W: Write + Seek>(
    input: &Path,
    writer: W,
    options: AudioOptions,
) -> Result<()> {
    if options.bitrate == 0 {
        return Err(ConvertError::InvalidOption(
            "audio bitrate must be greater than zero".to_string(),
        ));
    }

    let source = AudioSource::open(input)?;
    let channels = source.channels();

    match options.codec {
        AudioCodec::Opus => run(source, OpusSink::new(writer, channels, options.bitrate)?),
        AudioCodec::Aac => run(source, AacSink::new(writer, channels, options.bitrate)?),
        AudioCodec::Wav => run(source, WavSink::new(writer, channels)?),
    }
}
