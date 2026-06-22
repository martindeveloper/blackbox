use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::time::Instant;

use anyhow::{Context, Result, bail};
use blackbox_convert::{
    AudioCodec, AudioOptions, ImageFormat, ImageOptions, Resize, convert_audio, convert_image,
};
use blackbox_output::Output;

fn main() -> ExitCode {
    let args: Vec<OsString> = std::env::args_os().skip(1).collect();
    let json = args.iter().any(|arg| arg == "--json");
    let output = Output::new(json);
    match run(args.into_iter().filter(|arg| arg != "--json")) {
        Ok(Some(report)) => {
            let _ = output.emit(
                || serde_json::json!({ "kind": "convert", "ok": true, "converted": &report }),
                || format!("converted {} -> {}\n", report.input, report.output),
            );
            ExitCode::SUCCESS
        }
        Ok(None) => ExitCode::SUCCESS,
        Err(error) => {
            output.error(format!("blackbox-convert: {error:#}"));
            let _ = output.emit(
                || serde_json::json!({ "kind": "convert", "ok": false }),
                String::new,
            );
            ExitCode::from(2)
        }
    }
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ConvertReport {
    input: String,
    output: String,
    media: &'static str,
    format: &'static str,
    elapsed_ms: u128,
}

fn run(args: impl Iterator<Item = OsString>) -> Result<Option<ConvertReport>> {
    let args: Vec<OsString> = args.collect();
    match args.first().and_then(|value| value.to_str()) {
        Some("image") => run_image(&args[1..]).map(Some),
        Some("audio") => run_audio(&args[1..]).map(Some),
        Some("--version" | "-V") => {
            println!("blackbox-convert {}", env!("CARGO_PKG_VERSION"));
            Ok(None)
        }
        Some("--help" | "-h" | "help") | None => {
            print_help();
            Ok(None)
        }
        Some(command) => bail!("unknown command: {command}"),
    }
}

fn run_image(args: &[OsString]) -> Result<ConvertReport> {
    let mut parser = Args::new(args);
    let input = parser.path("input image")?;
    let output = parser.path("output image")?;
    let mut format = format_from_path(&output)?;
    let mut quality = 85;
    let mut resize = Resize::default();

    while let Some(flag) = parser.next_string()? {
        match flag.as_str() {
            "--format" => format = parse_image_format(&parser.value("--format")?)?,
            "--quality" => quality = parser.parse("--quality")?,
            "--scale" => resize.scale = Some(parser.parse("--scale")?),
            "--max-width" => resize.max_width = Some(parser.parse("--max-width")?),
            "--max-height" => resize.max_height = Some(parser.parse("--max-height")?),
            _ => bail!("unknown image option: {flag}"),
        }
    }

    let started = Instant::now();
    convert_image(
        &input,
        &output,
        ImageOptions {
            format,
            quality,
            resize,
        },
    )?;
    Ok(ConvertReport {
        input: input.display().to_string(),
        output: output.display().to_string(),
        media: "image",
        format: image_format_name(format),
        elapsed_ms: started.elapsed().as_millis(),
    })
}

fn run_audio(args: &[OsString]) -> Result<ConvertReport> {
    let mut parser = Args::new(args);
    let input = parser.path("input audio")?;
    let output = parser.path("output audio")?;
    let mut codec = codec_from_path(&output)?;
    let mut bitrate = default_bitrate(codec);

    while let Some(flag) = parser.next_string()? {
        match flag.as_str() {
            "--codec" => {
                codec = parse_audio_codec(&parser.value("--codec")?)?;
                bitrate = default_bitrate(codec);
            }
            "--bitrate" => bitrate = parser.parse("--bitrate")?,
            _ => bail!("unknown audio option: {flag}"),
        }
    }

    let started = Instant::now();
    convert_audio(&input, &output, AudioOptions { codec, bitrate })?;
    Ok(ConvertReport {
        input: input.display().to_string(),
        output: output.display().to_string(),
        media: "audio",
        format: audio_codec_name(codec),
        elapsed_ms: started.elapsed().as_millis(),
    })
}

fn image_format_name(format: ImageFormat) -> &'static str {
    match format {
        ImageFormat::Webp => "webp",
        ImageFormat::Png => "png",
        ImageFormat::Jpeg => "jpeg",
    }
}

fn audio_codec_name(codec: AudioCodec) -> &'static str {
    match codec {
        AudioCodec::Opus => "opus",
        AudioCodec::Aac => "aac",
        AudioCodec::Wav => "wav",
    }
}

fn parse_image_format(value: &str) -> Result<ImageFormat> {
    match value {
        "webp" => Ok(ImageFormat::Webp),
        "png" => Ok(ImageFormat::Png),
        "jpg" | "jpeg" => Ok(ImageFormat::Jpeg),
        _ => bail!("unsupported image format: {value}"),
    }
}

fn parse_audio_codec(value: &str) -> Result<AudioCodec> {
    match value {
        "opus" | "ogg" => Ok(AudioCodec::Opus),
        "aac" | "m4a" => Ok(AudioCodec::Aac),
        "wav" => Ok(AudioCodec::Wav),
        _ => bail!("unsupported audio codec: {value}"),
    }
}

fn format_from_path(path: &Path) -> Result<ImageFormat> {
    let extension = extension(path)?;
    parse_image_format(&extension)
}

fn codec_from_path(path: &Path) -> Result<AudioCodec> {
    let extension = extension(path)?;
    parse_audio_codec(&extension)
}

fn extension(path: &Path) -> Result<String> {
    path.extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .with_context(|| format!("output path has no valid extension: {}", path.display()))
}

fn default_bitrate(codec: AudioCodec) -> u32 {
    match codec {
        AudioCodec::Opus => 96_000,
        AudioCodec::Aac => 128_000,
        AudioCodec::Wav => 1,
    }
}

fn print_help() {
    println!(
        "\
blackbox-convert

USAGE:
    blackbox-convert image INPUT OUTPUT [OPTIONS]
    blackbox-convert audio INPUT OUTPUT [OPTIONS]

IMAGE OPTIONS:
    --format <webp|png|jpeg>
    --quality <0..100>
    --scale <FACTOR>
    --max-width <PIXELS>
    --max-height <PIXELS>

AUDIO OPTIONS:
    --codec <opus|aac|wav>
    --bitrate <BITS_PER_SECOND>

GLOBAL OPTIONS:
    --json
"
    );
}

struct Args<'a> {
    values: &'a [OsString],
    index: usize,
}

impl<'a> Args<'a> {
    fn new(values: &'a [OsString]) -> Self {
        Self { values, index: 0 }
    }

    fn path(&mut self, label: &str) -> Result<PathBuf> {
        let value = self
            .values
            .get(self.index)
            .with_context(|| format!("missing {label}"))?;
        self.index += 1;
        Ok(PathBuf::from(value))
    }

    fn next_string(&mut self) -> Result<Option<String>> {
        let Some(value) = self.values.get(self.index) else {
            return Ok(None);
        };
        self.index += 1;
        value
            .to_str()
            .map(str::to_owned)
            .map(Some)
            .context("argument is not valid UTF-8")
    }

    fn value(&mut self, flag: &str) -> Result<String> {
        self.next_string()?
            .with_context(|| format!("{flag} requires a value"))
    }

    fn parse<T>(&mut self, flag: &str) -> Result<T>
    where
        T: std::str::FromStr,
        T::Err: std::fmt::Display,
    {
        self.value(flag)?
            .parse()
            .map_err(|error| anyhow::anyhow!("invalid value for {flag}: {error}"))
    }
}
