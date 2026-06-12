use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode, Stdio};

use anyhow::{Context, Result};

use crate::platform::Platform;

use std::fmt::Write as _;

macro_rules! wln {
    ($w:expr $(, $($arg:tt)*)?) => {{ let _ = writeln!($w $(, $($arg)*)?); }};
}

#[derive(Debug, Clone)]
pub struct DoctorOptions {
    pub platform: Platform,
    pub ffmpeg: PathBuf,
    pub cwebp: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CheckStatus {
    Ok,
    Missing,
    NotNeeded,
}

struct CheckLine {
    name: &'static str,
    status: CheckStatus,
    detail: String,
    required: bool,
}

pub fn run(options: &DoctorOptions) -> ExitCode {
    let checks = collect_checks(options);
    let mut buf = String::new();
    print_report(&mut buf, options, &checks);
    blackbox_output::Output::new(false).print(&buf);

    if checks
        .iter()
        .any(|c| c.required && c.status == CheckStatus::Missing)
    {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    }
}

fn collect_checks(options: &DoctorOptions) -> Vec<CheckLine> {
    let ffmpeg_ok = tool_runs(&options.ffmpeg, &["-version"]);
    let ffmpeg_encoders = ffmpeg_ok.then(|| ffmpeg_encoders(&options.ffmpeg));

    let mut checks = vec![CheckLine {
        name: "ffmpeg",
        status: if ffmpeg_ok {
            CheckStatus::Ok
        } else {
            CheckStatus::Missing
        },
        detail: options.ffmpeg.display().to_string(),
        required: true,
    }];

    let cwebp_ok = tool_runs(&options.cwebp, &["-version"]);
    checks.push(CheckLine {
        name: "cwebp",
        status: if cwebp_ok {
            CheckStatus::Ok
        } else {
            CheckStatus::Missing
        },
        detail: if cwebp_ok {
            options.cwebp.display().to_string()
        } else {
            "not found (brew install webp)".to_string()
        },
        required: false,
    });

    checks.push(encoder_check(
        "ffmpeg:libwebp",
        ffmpeg_encoders
            .as_ref()
            .is_some_and(|e| e.contains("libwebp")),
        ffmpeg_ok,
        "WebP textures via ffmpeg (or use cwebp)",
    ));

    checks.push(encoder_check(
        "ffmpeg:libopus",
        ffmpeg_encoders
            .as_ref()
            .is_some_and(|e| e.contains("libopus")),
        ffmpeg_ok,
        "Opus/OGG audio (web, android)",
    ));

    let needs_aac = matches!(options.platform, Platform::Ios);
    checks.push(CheckLine {
        name: "ffmpeg:aac",
        status: if !ffmpeg_ok {
            CheckStatus::Missing
        } else if ffmpeg_encoders
            .as_ref()
            .is_some_and(|e| e.contains("aac") || e.contains("libfdk_aac"))
        {
            CheckStatus::Ok
        } else if needs_aac {
            CheckStatus::Missing
        } else {
            CheckStatus::NotNeeded
        },
        detail: if needs_aac {
            "needed for ios platform".to_string()
        } else {
            "only required for ios".to_string()
        },
        required: false,
    });

    checks.push(encoder_check(
        "ffmpeg:libmp3lame",
        ffmpeg_encoders
            .as_ref()
            .is_some_and(|e| e.contains("libmp3lame")),
        ffmpeg_ok,
        "MP3 audio fallback",
    ));

    checks
}

fn encoder_check(name: &'static str, present: bool, ffmpeg_ok: bool, hint: &str) -> CheckLine {
    CheckLine {
        name,
        status: if !ffmpeg_ok {
            CheckStatus::Missing
        } else if present {
            CheckStatus::Ok
        } else {
            CheckStatus::Missing
        },
        detail: hint.to_string(),
        required: false,
    }
}

fn print_report(w: &mut String, options: &DoctorOptions, checks: &[CheckLine]) {
    wln!(
        w,
        "blackbox-bundler doctor — platform: {}",
        options.platform.as_str()
    );
    wln!(w);

    wln!(w, "REQUIRED");
    for check in checks.iter().filter(|c| c.required) {
        print_check(w, check);
    }

    wln!(w);
    wln!(w, "OPTIONAL (smaller/faster bundles)");
    for check in checks.iter().filter(|c| !c.required) {
        print_check(w, check);
    }

    wln!(w);
    if checks
        .iter()
        .any(|c| c.required && c.status == CheckStatus::Missing)
    {
        wln!(w, "result: missing required tools");
    } else if checks
        .iter()
        .filter(|c| !c.required)
        .any(|c| c.status == CheckStatus::Missing)
    {
        wln!(
            w,
            "result: ok (some optional tools missing — bundles will use fallbacks)"
        );
    } else {
        wln!(w, "result: ok");
    }
}

fn print_check(w: &mut String, check: &CheckLine) {
    let status = match check.status {
        CheckStatus::Ok => "ok",
        CheckStatus::Missing => "MISSING",
        CheckStatus::NotNeeded => "n/a",
    };
    let note = tool_note(check);
    if note.is_empty() {
        wln!(w, "  {:16} {:7}  {}", check.name, status, check.detail);
    } else {
        wln!(
            w,
            "  {:16} {:7}  {} — {}",
            check.name,
            status,
            check.detail,
            note
        );
    }
}

fn tool_note(check: &CheckLine) -> &'static str {
    match (check.name, check.status) {
        ("cwebp", CheckStatus::Missing) => "textures may stay PNG-sized",
        ("ffmpeg:libwebp", CheckStatus::Missing) => "use cwebp instead",
        ("ffmpeg:libopus", CheckStatus::Missing) => "audio stays MP3 or raw",
        ("ffmpeg:aac", CheckStatus::Missing) => "ios audio may fall back to MP3",
        _ => "",
    }
}

fn tool_runs(program: &Path, args: &[&str]) -> bool {
    Command::new(program)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .ok()
        .is_some_and(|status| status.success())
}

fn ffmpeg_encoders(ffmpeg: &Path) -> String {
    let output = Command::new(ffmpeg)
        .args(["-hide_banner", "-encoders"])
        .output();
    match output {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).to_ascii_lowercase()
        }
        _ => String::new(),
    }
}

pub fn parse_doctor_args(mut args: impl Iterator<Item = String>) -> Result<DoctorOptions> {
    let mut platform = Platform::Web;
    let mut ffmpeg = PathBuf::from("ffmpeg");
    let mut cwebp = PathBuf::from("cwebp");

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--platform" => {
                platform = Platform::parse(
                    &args
                        .next()
                        .context("--platform requires web, ios, or android")?,
                )?;
            }
            "--ffmpeg" => {
                ffmpeg = PathBuf::from(args.next().context("--ffmpeg requires a path")?);
            }
            "--cwebp" => {
                cwebp = PathBuf::from(args.next().context("--cwebp requires a path")?);
            }
            "--help" | "-h" => {
                print_doctor_help();
                std::process::exit(0);
            }
            value if value.starts_with('-') => {
                anyhow::bail!("unknown doctor flag: {value}");
            }
            value => anyhow::bail!("unexpected argument: {value}"),
        }
    }

    Ok(DoctorOptions {
        platform,
        ffmpeg,
        cwebp,
    })
}

pub fn print_doctor_help() {
    blackbox_output::Output::new(false).print(
        "\
blackbox-bundler doctor — check bundler dependencies

USAGE:
    blackbox-bundler doctor [OPTIONS]

OPTIONS:
    --platform <TARGET>    Platform to check optional codecs for (default: web)
    --ffmpeg <PATH>        ffmpeg binary to probe (default: ffmpeg)
    --cwebp <PATH>         cwebp binary to probe (default: cwebp)
    -h, --help             Show this help
",
    );
}
