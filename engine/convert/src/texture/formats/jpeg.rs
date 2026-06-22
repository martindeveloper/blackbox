use std::io::Write;

use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, ExtendedColorType, ImageEncoder};

use crate::error::Result;

pub fn encode(image: &DynamicImage, quality: u8, writer: &mut impl Write) -> Result<()> {
    let rgb = image.to_rgb8();
    JpegEncoder::new_with_quality(writer, quality).write_image(
        rgb.as_raw(),
        rgb.width(),
        rgb.height(),
        ExtendedColorType::Rgb8,
    )?;
    Ok(())
}
