use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView};

use super::Resize;

pub fn apply(image: DynamicImage, options: Resize) -> DynamicImage {
    let (source_width, source_height) = image.dimensions();
    let scale = options.scale.unwrap_or(1.0) as f64;
    let mut width = (f64::from(source_width) * scale).round().max(1.0);
    let mut height = (f64::from(source_height) * scale).round().max(1.0);

    if let Some(max_width) = options.max_width {
        let ratio = f64::from(max_width) / width;
        if ratio < 1.0 {
            width *= ratio;
            height *= ratio;
        }
    }
    if let Some(max_height) = options.max_height {
        let ratio = f64::from(max_height) / height;
        if ratio < 1.0 {
            width *= ratio;
            height *= ratio;
        }
    }

    let width = width.round().clamp(1.0, f64::from(u32::MAX)) as u32;
    let height = height.round().clamp(1.0, f64::from(u32::MAX)) as u32;
    if width == source_width && height == source_height {
        image
    } else {
        image.resize_exact(width, height, FilterType::Lanczos3)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fits_inside_maximum_box() {
        let resized = apply(
            DynamicImage::new_rgba8(1920, 1080),
            Resize {
                scale: None,
                max_width: Some(800),
                max_height: Some(800),
            },
        );
        assert_eq!(resized.dimensions(), (800, 450));
    }

    #[test]
    fn applies_scale_before_maximum_box() {
        let resized = apply(
            DynamicImage::new_rgba8(1000, 500),
            Resize {
                scale: Some(2.0),
                max_width: Some(1200),
                max_height: None,
            },
        );
        assert_eq!(resized.dimensions(), (1200, 600));
    }
}
