mod aac;
mod opus;
mod wav;

use crate::error::Result;

pub use aac::AacSink;
pub use opus::OpusSink;
pub use wav::WavSink;

pub trait PcmSink {
    fn push(&mut self, samples: &[Vec<f32>], offset: usize, frames: usize) -> Result<()>;
    fn finish(self) -> Result<()>;
}
