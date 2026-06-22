use std::process::ExitCode;

use anyhow::{Context, Result};

use crate::platform::Platform;

#[derive(Debug, Clone, Copy)]
pub struct DoctorOptions {
    pub platform: Platform,
}

pub fn run(options: &DoctorOptions) -> ExitCode {
    let audio = match options.platform {
        Platform::Web | Platform::Android => "Opus/Ogg",
        Platform::Ios => "AAC/M4A",
    };
    blackbox_output::Output::new(false).print(&format!(
        "\
blackbox-bundler doctor — platform: {}

BUILT-IN MEDIA
  textures         ok       JPEG, PNG, WebP decode; WebP/JPEG/PNG encode
  audio input      ok       WAV, MP3, OGG/Vorbis, AAC/M4A
  audio output     ok       {audio}

result: ok (no external media tools required)
",
        options.platform.as_str()
    ));
    ExitCode::SUCCESS
}

pub fn parse_doctor_args(mut args: impl Iterator<Item = String>) -> Result<DoctorOptions> {
    let mut platform = Platform::Web;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--platform" => {
                platform = Platform::parse(
                    &args
                        .next()
                        .context("--platform requires web, ios, or android")?,
                )?;
            }
            "--help" | "-h" => {
                print_doctor_help();
                std::process::exit(0);
            }
            value if value.starts_with('-') => anyhow::bail!("unknown doctor flag: {value}"),
            value => anyhow::bail!("unexpected argument: {value}"),
        }
    }
    Ok(DoctorOptions { platform })
}

pub fn print_doctor_help() {
    blackbox_output::Output::new(false).print(
        "\
blackbox-bundler doctor — check built-in media support

USAGE:
    blackbox-bundler doctor [OPTIONS]

OPTIONS:
    --platform <TARGET>    Platform media profile (default: web)
    -h, --help             Show this help
",
    );
}
