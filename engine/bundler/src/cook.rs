use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use anyhow::Result;
use blackbox_bundler_cook::TextureCookProfile;

use crate::format::EntryCodec;
use crate::media::{AudioKind, MediaTools};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AssetKind {
    Texture,
    Music,
    Sfx,
}

#[derive(Debug, Clone)]
pub struct CookJob {
    pub src: String,
    pub source_path: PathBuf,
    pub source_display: String,
    pub kind: AssetKind,
    pub refs: Vec<String>,
    pub profile: TextureCookProfile,
    pub input_size: u64,
    pub input_format: &'static str,
}

#[derive(Debug)]
pub struct CookedAsset {
    pub src: String,
    pub bytes: Vec<u8>,
    pub codec: EntryCodec,
    pub input_size: u64,
    pub input_format: &'static str,
}

pub fn default_worker_count() -> usize {
    thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(1)
}

pub fn format_byte_size(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KiB", "MiB", "GiB", "TiB"];
    if bytes < 1024 {
        return format!("{bytes} {}", UNITS[0]);
    }

    let mut value = bytes as f64;
    let mut unit = 0usize;
    while value >= 1024.0 && unit + 1 < UNITS.len() {
        value /= 1024.0;
        unit += 1;
    }
    format!("{value:.1} {}", UNITS[unit])
}

#[derive(Debug, Clone, Copy)]
pub struct AssetTransformLog<'a> {
    pub actor: &'a str,
    pub file: &'a str,
    pub relative: &'a str,
    pub input_format: &'a str,
    pub input_size: u64,
    pub output_key: &'a str,
    pub output_codec: EntryCodec,
    pub output_size: u64,
}

pub fn log_asset_transform(out: &blackbox_output::Output, log: AssetTransformLog<'_>) {
    out.info(format!(
        "[{}] {}  (file: {}, {}, {})  ->  {} {} ({})",
        log.actor,
        log.relative,
        log.file,
        log.input_format,
        format_byte_size(log.input_size),
        log.output_key,
        log.output_codec.as_str(),
        format_byte_size(log.output_size),
    ));
}

/// Cook assets on a fixed worker pool. Results preserve `jobs` order.
pub fn cook_assets(
    jobs: Vec<CookJob>,
    tools: &MediaTools,
    workers: usize,
) -> Result<Vec<CookedAsset>> {
    let job_count = jobs.len();
    if job_count == 0 {
        return Ok(Vec::new());
    }

    let workers = workers.clamp(1, job_count);
    if tools.is_verbose() {
        tools
            .out()
            .info(format!("cooking {job_count} assets with {workers} workers"));
    }

    if workers == 1 {
        let tools = tools.with_worker_id(1);
        return jobs.into_iter().map(|job| cook_one(&job, &tools)).collect();
    }

    let jobs = Arc::new(jobs);
    let tools = tools.clone();
    let next_job = AtomicUsize::new(0);
    let results: Arc<Vec<Mutex<Option<Result<CookedAsset>>>>> =
        Arc::new((0..job_count).map(|_| Mutex::new(None)).collect());

    thread::scope(|scope| {
        for worker_id in 1..=workers {
            let jobs = Arc::clone(&jobs);
            let tools = tools.with_worker_id(worker_id);
            let next_job = &next_job;
            let results = Arc::clone(&results);

            scope.spawn(move || {
                loop {
                    let index = next_job.fetch_add(1, Ordering::Relaxed);
                    if index >= job_count {
                        break;
                    }

                    let cooked = cook_one(&jobs[index], &tools);
                    *results[index].lock().expect("cook result slot poisoned") = Some(cooked);
                }
            });
        }
    });

    let mut cooked = Vec::with_capacity(job_count);
    for slot in Arc::try_unwrap(results)
        .expect("cook worker threads still running")
        .into_iter()
    {
        cooked.push(
            slot.into_inner()
                .expect("cook result slot poisoned")
                .expect("cook worker left result slot empty")?,
        );
    }
    Ok(cooked)
}

fn cook_one(job: &CookJob, tools: &MediaTools) -> Result<CookedAsset> {
    let (bytes, codec) = match job.kind {
        AssetKind::Texture => tools.prepare_texture(&job.source_path, &job.src, job.profile)?,
        AssetKind::Music => tools.prepare_audio(&job.source_path, &job.src, AudioKind::Music)?,
        AssetKind::Sfx => tools.prepare_audio(&job.source_path, &job.src, AudioKind::Sfx)?,
    };

    if tools.is_verbose() {
        log_asset_transform(
            tools.out(),
            AssetTransformLog {
                actor: &tools.actor_label(),
                file: &job.source_display,
                relative: &job.src,
                input_format: job.input_format,
                input_size: job.input_size,
                output_key: &job.src,
                output_codec: codec,
                output_size: bytes.len() as u64,
            },
        );
    }

    Ok(CookedAsset {
        src: job.src.clone(),
        bytes,
        codec,
        input_size: job.input_size,
        input_format: job.input_format,
    })
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;
    use crate::cache::CookCache;
    use crate::platform::Platform;

    #[test]
    fn cook_assets_preserves_job_order_with_workers() {
        let data_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/assets");
        let jobs = vec![
            CookJob {
                src: "sfx/click.wav".to_string(),
                source_path: data_root.join("sfx/click.wav"),
                source_display: data_root.join("sfx/click.wav").display().to_string(),
                kind: AssetKind::Sfx,
                refs: vec!["click".to_string()],
                profile: TextureCookProfile::default(),
                input_size: 1,
                input_format: "wav",
            },
            CookJob {
                src: "textures/backgrounds/scene.png".to_string(),
                source_path: data_root.join("textures/backgrounds/scene.png"),
                source_display: data_root
                    .join("textures/backgrounds/scene.png")
                    .display()
                    .to_string(),
                kind: AssetKind::Texture,
                refs: vec!["background_chapel".to_string()],
                profile: TextureCookProfile::default(),
                input_size: 1,
                input_format: "png",
            },
        ];

        let tools = MediaTools::new(
            PathBuf::from("ffmpeg"),
            PathBuf::from("cwebp"),
            Platform::Web,
            true,
            Some(CookCache::new(
                std::env::temp_dir().join("blackbox-bundler-cook-test"),
                Platform::Web,
            )),
            false,
            std::sync::Arc::new(blackbox_output::Output::new(false)),
        )
        .expect("media tools");

        let cooked = cook_assets(jobs, &tools, 4).expect("cook assets");
        assert_eq!(cooked.len(), 2);
        assert_eq!(cooked[0].src, "sfx/click.wav");
        assert_eq!(cooked[1].src, "textures/backgrounds/scene.png");
    }
}
