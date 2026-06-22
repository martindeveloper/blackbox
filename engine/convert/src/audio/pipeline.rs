use rubato::{
    Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
};

use crate::error::{ConvertError, Result};

use super::TARGET_RATE;
use super::decode::AudioSource;
use super::formats::PcmSink;

const CHUNK_FRAMES: usize = 2048;

pub fn run<S: PcmSink>(mut source: AudioSource, mut sink: S) -> Result<()> {
    let mut resampler = create_resampler(source.sample_rate(), source.channels())?;
    let mut input = resampler.input_buffer_allocate(true);
    let mut output = resampler.output_buffer_allocate(true);
    let ratio = f64::from(TARGET_RATE) / f64::from(source.sample_rate());
    let delay = resampler.output_delay();
    let mut skipped = 0;
    let mut input_frames = 0_u64;
    let mut output_frames = 0_u64;
    let mut reached_end = false;

    loop {
        let frames = if reached_end {
            0
        } else {
            source.read_frames(&mut input)?
        };
        if frames < input[0].len() {
            reached_end = true;
        }
        for channel in &mut input {
            channel[frames..].fill(0.0);
        }
        input_frames += frames as u64;
        let (_, produced) = resampler
            .process_into_buffer(&input, &mut output, None)
            .map_err(|error| ConvertError::Encode(format!("resampler: {error}")))?;

        let skip = (delay - skipped).min(produced);
        skipped += skip;
        let target = (input_frames as f64 * ratio).round() as u64;
        let count = (produced - skip).min(target.saturating_sub(output_frames) as usize);
        if count > 0 {
            sink.push(&output, skip, count)?;
            output_frames += count as u64;
        }
        if reached_end && output_frames == target {
            break;
        }
    }

    sink.finish()
}

fn create_resampler(sample_rate: u32, channels: usize) -> Result<SincFixedIn<f32>> {
    let parameters = SincInterpolationParameters {
        sinc_len: 128,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Cubic,
        oversampling_factor: 128,
        window: WindowFunction::BlackmanHarris2,
    };
    SincFixedIn::new(
        f64::from(TARGET_RATE) / f64::from(sample_rate),
        1.0,
        parameters,
        CHUNK_FRAMES,
        channels,
    )
    .map_err(|error| ConvertError::Encode(format!("resampler: {error}")))
}
