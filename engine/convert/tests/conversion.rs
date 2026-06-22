use std::f32::consts::TAU;
use std::fs;
use std::path::Path;

use blackbox_convert::{AudioCodec, AudioOptions, convert_audio};
use tempfile::TempDir;

const SOURCE_RATE: u32 = 44_100;
const SOURCE_FRAMES: usize = 11_025;
const TARGET_FRAMES: u64 = 12_000;

#[test]
fn opus_output_ends_at_resampled_source_length() {
    let temp = TempDir::new().expect("temp dir");
    let input = temp.path().join("input.wav");
    let output = temp.path().join("output.ogg");
    write_sine(&input);

    convert_audio(
        &input,
        &output,
        AudioOptions {
            codec: AudioCodec::Opus,
            bitrate: 64_000,
        },
    )
    .expect("convert Opus");

    assert_eq!(
        final_ogg_granule(&fs::read(output).expect("read Ogg")),
        u64::from(312_u16) + TARGET_FRAMES
    );
}

#[test]
fn aac_output_has_resampled_source_duration() {
    let temp = TempDir::new().expect("temp dir");
    let input = temp.path().join("input.wav");
    let encoded = temp.path().join("output.m4a");
    write_sine(&input);

    convert_audio(
        &input,
        &encoded,
        AudioOptions {
            codec: AudioCodec::Aac,
            bitrate: 96_000,
        },
    )
    .expect("convert AAC");

    let file = fs::File::open(&encoded).expect("open M4A");
    let size = file.metadata().expect("M4A metadata").len();
    let reader = mp4::Mp4Reader::read_header(file, size).expect("parse M4A");
    assert!((reader.duration().as_secs_f64() - 0.25).abs() < 0.001);
}

fn write_sine(path: &Path) {
    let mut writer = hound::WavWriter::create(
        path,
        hound::WavSpec {
            channels: 2,
            sample_rate: SOURCE_RATE,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        },
    )
    .expect("create WAV");

    for frame in 0..SOURCE_FRAMES {
        let phase = frame as f32 * 440.0 * TAU / SOURCE_RATE as f32;
        let sample = (phase.sin() * 0.25 * f32::from(i16::MAX)) as i16;
        writer.write_sample(sample).expect("left sample");
        writer.write_sample(sample).expect("right sample");
    }
    writer.finalize().expect("finalize WAV");
}

fn final_ogg_granule(bytes: &[u8]) -> u64 {
    let mut offset = 0;
    let mut granule = 0;
    while offset + 27 <= bytes.len() {
        assert_eq!(&bytes[offset..offset + 4], b"OggS");
        let segments = usize::from(bytes[offset + 26]);
        let header_end = offset + 27 + segments;
        let body_len: usize = bytes[offset + 27..header_end]
            .iter()
            .map(|&value| usize::from(value))
            .sum();
        granule = u64::from_le_bytes(
            bytes[offset + 6..offset + 14]
                .try_into()
                .expect("granule bytes"),
        );
        offset = header_end + body_len;
    }
    granule
}
