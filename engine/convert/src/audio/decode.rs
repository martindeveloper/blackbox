use std::fs::File;
use std::path::Path;

use symphonia::core::audio::sample::Sample;
use symphonia::core::codecs::audio::{AudioDecoder, AudioDecoderOptions};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, FormatReader, TrackType};
use symphonia::core::io::{MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;

use crate::error::{ConvertError, Result};

pub struct AudioSource {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn AudioDecoder>,
    track_id: u32,
    sample_rate: u32,
    channels: usize,
    samples: Vec<f32>,
    sample_offset: usize,
}

impl AudioSource {
    pub fn open(path: &Path) -> Result<Self> {
        let stream = MediaSourceStream::new(
            Box::new(File::open(path)?),
            MediaSourceStreamOptions {
                buffer_len: 256 * 1024,
            },
        );
        let mut hint = Hint::new();
        if let Some(extension) = path.extension().and_then(|value| value.to_str()) {
            hint.with_extension(extension);
        }
        let format = symphonia::default::get_probe()
            .probe(
                &hint,
                stream,
                FormatOptions::default(),
                MetadataOptions::default(),
            )
            .map_err(|error| ConvertError::Decode(error.to_string()))?;
        let track = format
            .default_track(TrackType::Audio)
            .ok_or(ConvertError::NoAudioTrack)?;
        let params = track
            .codec_params
            .as_ref()
            .and_then(|params| params.audio())
            .ok_or(ConvertError::NoAudioTrack)?
            .clone();
        let sample_rate = params.sample_rate.ok_or(ConvertError::MissingSampleRate)?;
        let channels = params
            .channels
            .as_ref()
            .map(|value| value.count())
            .ok_or(ConvertError::UnsupportedChannels(0))?;
        if !(1..=2).contains(&channels) {
            return Err(ConvertError::UnsupportedChannels(channels));
        }
        let decoder = symphonia::default::get_codecs()
            .make_audio_decoder(&params, &AudioDecoderOptions::default())
            .map_err(|error| ConvertError::Decode(error.to_string()))?;
        let track_id = track.id;

        Ok(Self {
            format,
            decoder,
            track_id,
            sample_rate,
            channels,
            samples: Vec::new(),
            sample_offset: 0,
        })
    }

    pub fn channels(&self) -> usize {
        self.channels
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn read_frames(&mut self, output: &mut [Vec<f32>]) -> Result<usize> {
        let target = output[0].len();
        let mut written = 0;

        while written < target {
            if !self.samples.is_empty() {
                let available = self.samples.len() / self.channels - self.sample_offset;
                let count = available.min(target - written);
                for frame in 0..count {
                    let source = (self.sample_offset + frame) * self.channels;
                    for (channel, output) in output.iter_mut().enumerate().take(self.channels) {
                        output[written + frame] = self.samples[source + channel];
                    }
                }
                self.sample_offset += count;
                written += count;
                if self.sample_offset == self.samples.len() / self.channels {
                    self.samples.clear();
                    self.sample_offset = 0;
                }
                continue;
            }
            if !self.decode_packet()? {
                break;
            }
        }
        Ok(written)
    }

    fn decode_packet(&mut self) -> Result<bool> {
        loop {
            let packet = match self.format.next_packet() {
                Ok(Some(packet)) => packet,
                Ok(None) => return Ok(false),
                Err(error) => return Err(ConvertError::Decode(error.to_string())),
            };
            if packet.track_id != self.track_id {
                continue;
            }
            let decoded = match self.decoder.decode(&packet) {
                Ok(decoded) => decoded,
                Err(SymphoniaError::DecodeError(_)) => continue,
                Err(error) => return Err(ConvertError::Decode(error.to_string())),
            };
            self.samples.resize(decoded.samples_interleaved(), f32::MID);
            decoded.copy_to_slice_interleaved(&mut self.samples);
            self.sample_offset = 0;
            return Ok(true);
        }
    }
}
