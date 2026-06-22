use std::io::Write;

use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{DynamicImage, ExtendedColorType, ImageEncoder};

use crate::error::Result;

pub fn encode(image: &DynamicImage, writer: &mut impl Write) -> Result<()> {
    let rgba = image.to_rgba8();
    PngEncoder::new_with_quality(writer, CompressionType::Best, FilterType::Adaptive).write_image(
        rgba.as_raw(),
        rgba.width(),
        rgba.height(),
        ExtendedColorType::Rgba8,
    )?;
    Ok(())
}
