mod ogg;

use std::io::Write;

use opus_rs::{Application, OpusEncoder};

use crate::error::{ConvertError, Result};

use self::ogg::OggWriter;
use super::PcmSink;
use crate::audio::TARGET_RATE;

const FRAME_SIZE: usize = 960;
const PRE_SKIP: u16 = 312;

pub struct OpusSink<W: Write> {
    encoder: OpusEncoder,
    ogg: OggWriter<W>,
    channels: usize,
    frame: Vec<f32>,
    frame_len: usize,
    packet: Vec<u8>,
    pending: Vec<u8>,
    pending_len: usize,
    pending_granule: u64,
    granule: u64,
}

impl<W: Write> OpusSink<W> {
    pub fn new(writer: W, channels: usize, bitrate: u32) -> Result<Self> {
        let mut encoder = OpusEncoder::new(TARGET_RATE as i32, channels, Application::Audio)
            .map_err(|error| ConvertError::Encode(format!("Opus: {error}")))?;
        encoder.bitrate_bps = bitrate as i32;
        Ok(Self {
            encoder,
            ogg: OggWriter::new(writer, channels as u8, PRE_SKIP)?,
            channels,
            frame: vec![0.0; FRAME_SIZE * channels],
            frame_len: 0,
            packet: vec![0; 4096],
            pending: vec![0; 4096],
            pending_len: 0,
            pending_granule: 0,
            granule: u64::from(PRE_SKIP),
        })
    }

    fn encode_frame(&mut self, valid_frames: usize) -> Result<()> {
        if self.pending_len > 0 {
            self.ogg.write_packet(
                &self.pending[..self.pending_len],
                self.pending_granule,
                false,
            )?;
        }
        let size = self
            .encoder
            .encode(&self.frame, FRAME_SIZE, &mut self.packet)
            .map_err(|error| ConvertError::Encode(format!("Opus: {error}")))?;
        self.granule += valid_frames as u64;
        std::mem::swap(&mut self.packet, &mut self.pending);
        self.pending_len = size;
        self.pending_granule = self.granule;
        self.frame_len = 0;
        Ok(())
    }
}

impl<W: Write> PcmSink for OpusSink<W> {
    fn push(&mut self, samples: &[Vec<f32>], sample_offset: usize, frames: usize) -> Result<()> {
        let mut offset = 0;
        while offset < frames {
            let count = (FRAME_SIZE - self.frame_len).min(frames - offset);
            for frame in 0..count {
                for (channel, samples) in samples.iter().enumerate().take(self.channels) {
                    self.frame[(self.frame_len + frame) * self.channels + channel] =
                        samples[sample_offset + offset + frame];
                }
            }
            self.frame_len += count;
            offset += count;
            if self.frame_len == FRAME_SIZE {
                self.encode_frame(FRAME_SIZE)?;
            }
        }
        Ok(())
    }

    fn finish(mut self) -> Result<()> {
        if self.frame_len > 0 {
            let valid = self.frame_len;
            self.frame[valid * self.channels..].fill(0.0);
            self.encode_frame(valid)?;
        }
        if self.pending_len > 0 {
            self.ogg.write_packet(
                &self.pending[..self.pending_len],
                self.pending_granule,
                true,
            )?;
        }
        self.ogg.into_inner().flush()?;
        Ok(())
    }
}
