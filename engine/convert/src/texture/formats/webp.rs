use std::io::Write;

use image::DynamicImage;

use crate::error::{ConvertError, Result};

pub fn encode(image: &DynamicImage, quality: u8, writer: &mut impl Write) -> Result<()> {
    let rgba = image.to_rgba8();
    let encoded = webp::Encoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height())
        .encode_simple(false, f32::from(quality))
        .map_err(|error| ConvertError::Encode(format!("WebP: {error:?}")))?;
    writer.write_all(encoded.as_ref())?;
    Ok(())
}
