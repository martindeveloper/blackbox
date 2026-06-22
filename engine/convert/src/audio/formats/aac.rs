use std::io::{Seek, Write};

use bytes::Bytes;
use fdk_aac::enc::{AudioObjectType, BitRate, ChannelMode, Encoder, EncoderParams, Transport};
use mp4::{
    AacConfig, AudioObjectType as Mp4AudioObjectType, ChannelConfig, FourCC, MediaConfig,
    Mp4Config, Mp4Sample, Mp4Writer, SampleFreqIndex, TrackConfig,
};

use crate::audio::TARGET_RATE;
use crate::error::{ConvertError, Result};

use super::PcmSink;

const FRAME_SIZE: usize = 1024;

pub struct AacSink<W: Write + Seek> {
    encoder: Encoder,
    writer: Mp4Writer<W>,
    channels: usize,
    frame: Vec<i16>,
    frame_len: usize,
    packet: Vec<u8>,
    sample_time: u64,
}

impl<W: Write + Seek> AacSink<W> {
    pub fn new(writer: W, channels: usize, bitrate: u32) -> Result<Self> {
        let channel_mode = if channels == 1 {
            ChannelMode::Mono
        } else {
            ChannelMode::Stereo
        };
        let encoder = Encoder::new(EncoderParams {
            bit_rate: BitRate::Cbr(bitrate),
            sample_rate: TARGET_RATE,
            transport: Transport::Raw,
            channels: channel_mode,
            audio_object_type: AudioObjectType::Mpeg4LowComplexity,
        })
        .map_err(|error| ConvertError::Encode(format!("AAC: {error}")))?;
        let mut writer = Mp4Writer::write_start(
            writer,
            &Mp4Config {
                major_brand: FourCC::from(*b"M4A "),
                minor_version: 0,
                compatible_brands: vec![
                    FourCC::from(*b"M4A "),
                    FourCC::from(*b"isom"),
                    FourCC::from(*b"mp42"),
                ],
                timescale: TARGET_RATE,
            },
        )
        .map_err(|error| ConvertError::Container(error.to_string()))?;
        writer
            .add_track(&TrackConfig {
                track_type: mp4::TrackType::Audio,
                timescale: TARGET_RATE,
                language: "und".to_string(),
                media_conf: MediaConfig::AacConfig(AacConfig {
                    bitrate,
                    profile: Mp4AudioObjectType::AacLowComplexity,
                    freq_index: SampleFreqIndex::Freq48000,
                    chan_conf: if channels == 1 {
                        ChannelConfig::Mono
                    } else {
                        ChannelConfig::Stereo
                    },
                }),
            })
            .map_err(|error| ConvertError::Container(error.to_string()))?;
        Ok(Self {
            encoder,
            writer,
            channels,
            frame: vec![0; FRAME_SIZE * channels],
            frame_len: 0,
            packet: vec![0; 8192],
            sample_time: 0,
        })
    }

    fn encode_frame(&mut self, valid_frames: usize) -> Result<()> {
        let encoded = self
            .encoder
            .encode(&self.frame, &mut self.packet)
            .map_err(|error| ConvertError::Encode(format!("AAC: {error}")))?;
        if encoded.output_size > 0 {
            self.writer
                .write_sample(
                    1,
                    &Mp4Sample {
                        start_time: self.sample_time,
                        duration: valid_frames as u32,
                        rendering_offset: 0,
                        is_sync: true,
                        bytes: Bytes::copy_from_slice(&self.packet[..encoded.output_size]),
                    },
                )
                .map_err(|error| ConvertError::Container(error.to_string()))?;
            self.sample_time += valid_frames as u64;
        }
        self.frame_len = 0;
        Ok(())
    }
}

impl<W: Write + Seek> PcmSink for AacSink<W> {
    fn push(&mut self, samples: &[Vec<f32>], sample_offset: usize, frames: usize) -> Result<()> {
        let mut offset = 0;
        while offset < frames {
            let count = (FRAME_SIZE - self.frame_len).min(frames - offset);
            for frame in 0..count {
                for (channel, samples) in samples.iter().enumerate().take(self.channels) {
                    let sample = samples[sample_offset + offset + frame].clamp(-1.0, 1.0);
                    self.frame[(self.frame_len + frame) * self.channels + channel] =
                        (sample * f32::from(i16::MAX)).round() as i16;
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
            self.frame[valid * self.channels..].fill(0);
            self.encode_frame(valid)?;
        }
        self.writer
            .write_end()
            .map_err(|error| ConvertError::Container(error.to_string()))?;
        self.writer.into_writer().flush()?;
        Ok(())
    }
}
