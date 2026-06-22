use std::io::{Seek, Write};

use crate::audio::TARGET_RATE;
use crate::error::{ConvertError, Result};

use super::PcmSink;

pub struct WavSink<W: Write + Seek> {
    writer: hound::WavWriter<W>,
    channels: usize,
}

impl<W: Write + Seek> WavSink<W> {
    pub fn new(writer: W, channels: usize) -> Result<Self> {
        let writer = hound::WavWriter::new(
            writer,
            hound::WavSpec {
                channels: channels as u16,
                sample_rate: TARGET_RATE,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            },
        )
        .map_err(|error| ConvertError::Container(error.to_string()))?;
        Ok(Self { writer, channels })
    }
}

impl<W: Write + Seek> PcmSink for WavSink<W> {
    fn push(&mut self, samples: &[Vec<f32>], offset: usize, frames: usize) -> Result<()> {
        for frame in 0..frames {
            for channel in samples.iter().take(self.channels) {
                let sample = channel[offset + frame].clamp(-1.0, 1.0);
                self.writer
                    .write_sample((sample * f32::from(i16::MAX)).round() as i16)
                    .map_err(|error| ConvertError::Container(error.to_string()))?;
            }
        }
        Ok(())
    }

    fn finish(self) -> Result<()> {
        self.writer
            .finalize()
            .map_err(|error| ConvertError::Container(error.to_string()))
    }
}
