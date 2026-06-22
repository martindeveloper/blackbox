mod formats;
mod resize;

use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;

use image::ImageReader;

use crate::error::{ConvertError, Result};

use self::resize::apply;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageFormat {
    Webp,
    Png,
    Jpeg,
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Resize {
    pub scale: Option<f32>,
    pub max_width: Option<u32>,
    pub max_height: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ImageOptions {
    pub format: ImageFormat,
    pub quality: u8,
    pub resize: Resize,
}

pub fn convert_image(input: &Path, output: &Path, options: ImageOptions) -> Result<()> {
    validate(options)?;
    let image = apply(
        ImageReader::open(input)?.with_guessed_format()?.decode()?,
        options.resize,
    );
    let mut writer = BufWriter::with_capacity(256 * 1024, File::create(output)?);
    match options.format {
        ImageFormat::Webp => formats::webp::encode(&image, options.quality, &mut writer)?,
        ImageFormat::Png => formats::png::encode(&image, &mut writer)?,
        ImageFormat::Jpeg => formats::jpeg::encode(&image, options.quality, &mut writer)?,
    }
    writer.flush()?;
    Ok(())
}

fn validate(options: ImageOptions) -> Result<()> {
    if options.quality > 100 {
        return Err(ConvertError::InvalidOption(
            "image quality must be in 0..=100".to_string(),
        ));
    }
    if options
        .resize
        .scale
        .is_some_and(|scale| !(scale > 0.0 && scale <= 4.0))
    {
        return Err(ConvertError::InvalidOption(
            "resize scale must be in (0, 4]".to_string(),
        ));
    }
    if options.resize.max_width == Some(0) || options.resize.max_height == Some(0) {
        return Err(ConvertError::InvalidOption(
            "resize dimensions must be greater than zero".to_string(),
        ));
    }
    Ok(())
}
