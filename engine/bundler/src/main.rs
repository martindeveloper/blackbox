use std::collections::BTreeMap;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::Arc;

use anyhow::{Context, Result, bail};
use blackbox_bundler::{
    cache::CookCache, cook, deps, doctor, format, inspect, media, platform, read_cook_document,
    resolve_cook_path, scenario_io, validate_cook_document,
};
use blackbox_bundler_cook::TextureCookProfile;
use blackbox_format::{
    encode_assets_document, encode_catalog_document, encode_chapter_document,
    encode_characters_document, encode_items_document, encode_library_document,
    encode_scenario_document,
};
use cook::{
    AssetKind, AssetTransformLog, CookJob, cook_assets, default_worker_count, format_byte_size,
    log_asset_transform,
};
use format::{
    ArchiveCompression, BundleWriter, ChapterBundleRef, EntryCodec, PROJECT_MAP_NAME,
    SHARED_BUNDLE_NAME, bundle_blob_name, write_project_map,
};
use media::MediaTools;
use platform::Platform;

type EncodeDocument = fn(&[u8]) -> Result<Vec<u8>, blackbox::EngineError>;
use scenario_io::{decode_scenario_bundle_files, read_scenario_bundle_files};

struct Options {
    scenario: PathBuf,
    output: PathBuf,
    platform: Platform,
    data_root: Option<PathBuf>,
    cache_dir: PathBuf,
    ffmpeg: PathBuf,
    cwebp: PathBuf,
    skip_transcode: bool,
    skip_missing: bool,
    archive_compression: ArchiveCompression,
    jobs: usize,
    verbose: bool,
    json: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BundleWrittenJson {
    output_path: String,
    size: String,
    scenario: String,
    platform: String,
    chapter_count: Option<usize>,
    transcode: bool,
    archive: String,
}

#[derive(serde::Serialize)]
struct BundleJson {
    kind: &'static str,
    written: BundleWrittenJson,
    result: &'static str,
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    // Bootstrap sink for pre-dispatch output (version, help, fatal errors). Each
    // subcommand builds its own Output from its parsed --json flag.
    let out = blackbox_output::Output::new(args.iter().any(|a| a == "--json"));

    if args.first().is_some_and(|a| a == "--version" || a == "-V") {
        out.print(&format!("blackbox-bundler {}\n", env!("CARGO_PKG_VERSION")));
        return ExitCode::SUCCESS;
    }

    if args.first().is_some_and(|arg| arg == "doctor") {
        return doctor::run(
            &doctor::parse_doctor_args(args.into_iter().skip(1)).unwrap_or_else(|error| {
                fatal(&out, &error);
                std::process::exit(2);
            }),
        );
    }

    if args.first().is_some_and(|arg| arg == "inspect") {
        return inspect::run(
            &inspect::parse_inspect_args(args.into_iter().skip(1)).unwrap_or_else(|error| {
                fatal(&out, &error);
                std::process::exit(2);
            }),
        );
    }

    if matches!(
        args.first().map(String::as_str),
        Some("help") | Some("--help") | Some("-h")
    ) {
        print_help(&out);
        return ExitCode::SUCCESS;
    }

    match run_bundle(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            fatal(&out, &error);
            ExitCode::from(2)
        }
    }
}

/// Report a fatal error through the shared Output: stderr log in human mode, a
/// `{ok:false, logs:[…]}` line in JSON mode.
fn fatal(out: &blackbox_output::Output, error: &anyhow::Error) {
    out.error(format!("blackbox-bundler: {error:#}"));
    let _ = out.emit(
        || serde_json::json!({ "kind": "bundle", "ok": false }),
        String::new,
    );
}

fn run_bundle(args: &[String]) -> Result<()> {
    let options = parse_bundle_args(args)?;
    let output = Arc::new(blackbox_output::Output::new(options.json));
    let scenario_path = options
        .scenario
        .canonicalize()
        .with_context(|| format!("resolve scenario path {}", options.scenario.display()))?;

    let bundle_files = read_scenario_bundle_files(&scenario_path)
        .with_context(|| format!("read scenario bundle {}", scenario_path.display()))?;
    let content = decode_scenario_bundle_files(&bundle_files)
        .with_context(|| format!("load scenario {}", scenario_path.display()))?;

    let scenario_dir = scenario_path
        .parent()
        .context("scenario path has no parent directory")?;
    let data_root = resolve_data_root(&scenario_path, options.data_root.clone());
    if !data_root.is_dir() {
        bail!("data root does not exist: {}", data_root.display());
    }

    let scenario_name = scenario_dir
        .file_name()
        .and_then(|name| name.to_str())
        .context("scenario directory name is not valid UTF-8")?
        .to_string();

    let cook_path = resolve_cook_path(scenario_dir, &bundle_files.scenario);
    let cook_book = match read_cook_document(&cook_path)? {
        None => None,
        Some(doc) => {
            let known_srcs: BTreeSet<&str> = content.assets.src_paths().collect();
            let known_refs: BTreeSet<&str> = content.assets.ref_ids().collect();
            for err in validate_cook_document(&doc, &known_srcs, &known_refs) {
                if err.code == "unknown-cook-platform" {
                    output.warn(format!("warning: {}", err.message));
                } else {
                    bail!("{}: {}", err.code, err.message);
                }
            }
            if options.verbose {
                output.info(format!("cook rules {}", display_path(&cook_path)));
            }
            Some(doc.into_book(options.platform.as_str()))
        }
    };

    let cache = if options.skip_transcode {
        None
    } else {
        Some(CookCache::new(options.cache_dir.clone(), options.platform))
    };

    let tools = MediaTools::new(
        options.ffmpeg.clone(),
        options.cwebp.clone(),
        options.platform,
        options.skip_transcode,
        cache,
        options.verbose,
        Arc::clone(&output),
    )?;
    let cook_jobs = build_cook_jobs(
        &content,
        &data_root,
        cook_book.as_ref(),
        options.skip_missing,
        options.verbose,
        &output,
    )?;
    let cooked_assets = cook_assets(cook_jobs, &tools, options.jobs)?;

    let ctx = BundleContext {
        options: &options,
        out: &output,
        bundle_files: &bundle_files,
        scenario_path: &scenario_path,
        scenario_dir,
        data_root: &data_root,
        scenario_name: &scenario_name,
    };

    if bundle_files.chapters.is_empty() {
        bundle_monolithic(&ctx, cooked_assets)?;
    } else {
        bundle_project(&ctx, &content, cooked_assets)?;
    }

    Ok(())
}

fn parse_bundle_args(args: &[String]) -> Result<Options> {
    let mut args = args.iter().map(String::as_str);
    let mut scenario = None;
    let mut output = PathBuf::from("dist/bundle");
    let mut platform = None;
    let mut data_root = None;
    let mut cache_dir = PathBuf::from(".cache/bundle");
    let mut ffmpeg = PathBuf::from("ffmpeg");
    let mut cwebp = PathBuf::from("cwebp");
    let mut skip_transcode = false;
    let mut skip_missing = false;
    let mut archive_compression = ArchiveCompression::None;
    let mut jobs = default_worker_count();
    let mut verbose = false;
    let mut json = false;

    while let Some(arg) = args.next() {
        match arg {
            "doctor" => bail!("use 'blackbox-bundler doctor' as a separate command"),
            "inspect" => bail!("use 'blackbox-bundler inspect' as a separate command"),
            "--platform" => {
                platform = Some(Platform::parse(
                    args.next()
                        .context("--platform requires web, ios, or android")?,
                )?);
            }
            "-o" | "--output" => {
                output = PathBuf::from(
                    args.next()
                        .context("-o/--output requires a path argument")?,
                );
            }
            "--data-root" => {
                data_root = Some(PathBuf::from(
                    args.next()
                        .context("--data-root requires a path argument")?,
                ));
            }
            "--cache-dir" => {
                cache_dir = PathBuf::from(
                    args.next()
                        .context("--cache-dir requires a path argument")?,
                );
            }
            "--ffmpeg" => {
                ffmpeg = PathBuf::from(args.next().context("--ffmpeg requires a path argument")?);
            }
            "--cwebp" => {
                cwebp = PathBuf::from(args.next().context("--cwebp requires a path argument")?);
            }
            "--skip-transcode" => skip_transcode = true,
            "--ignore-missing" => skip_missing = true,
            "--archive-compress" => {
                archive_compression = ArchiveCompression::parse(
                    args.next().context("--archive-compress requires zstd")?,
                )?;
            }
            "--jobs" => {
                jobs = args
                    .next()
                    .context("--jobs requires a positive integer")?
                    .parse()
                    .context("--jobs must be a positive integer")?;
                if jobs == 0 {
                    jobs = default_worker_count();
                }
            }
            "-v" | "--verbose" => verbose = true,
            "--json" => json = true,
            "--help" | "-h" => {
                print_help(&blackbox_output::Output::new(false));
                std::process::exit(0);
            }
            value if value.starts_with('-') => bail!("unknown flag: {value}"),
            value => {
                if scenario.is_some() {
                    bail!("unexpected argument: {value}");
                }
                scenario = Some(PathBuf::from(value));
            }
        }
    }

    let scenario =
        scenario.context("scenario path required (e.g. data/silent_archive_game/scenario.json)")?;
    let platform = platform.context("--platform is required (web, ios, or android)")?;

    Ok(Options {
        scenario,
        output,
        platform,
        data_root,
        cache_dir,
        ffmpeg,
        cwebp,
        skip_transcode,
        skip_missing,
        archive_compression,
        jobs,
        verbose,
        json,
    })
}

fn print_help(out: &blackbox_output::Output) {
    out.print(
        "\
blackbox-bundler — compile scenario JSON and assets into bundle.box

USAGE:
    blackbox-bundler [OPTIONS] SCENARIO.json
    blackbox-bundler doctor [OPTIONS]
    blackbox-bundler inspect [DIR]

ARGUMENTS:
    SCENARIO.json          Path to scenario manifest (e.g. data/<name>/scenario.json)

OPTIONS:
    --platform <TARGET>    Target platform: web, ios, or android (required)
    -o, --output <PATH>    Output directory (default: dist/bundle)
    --data-root <PATH>     Asset root for src paths (default: scenario folder)
    --cache-dir <PATH>     Cook cache root (default: .cache/bundle)
    --ffmpeg <PATH>        ffmpeg binary (default: ffmpeg)
    --cwebp <PATH>         cwebp binary for WebP textures (default: cwebp)
    --skip-transcode       Pack source assets unchanged (escape hatch; skips cook cache)
    --ignore-missing       Skip asset src paths whose files are not on disk (dev only)
    --archive-compress <F> Lossless archive compression for shipping (zstd)
    --jobs <N>             Parallel cook workers (default: CPU count; 0 = auto)
    -v, --verbose          Log each input asset and final bundle size
    -h, --help             Show this help

PIPELINE:
    1. Cook/transcode assets to platform runtime formats (WebP, Opus, …)
    2. Pack cooked bytes into bundle.box (+ msgpack content docs)
    3. Optionally write bundle.box.zst for release shipping

Authoring assets live under data/<name>/ as lossless sources (PNG, WAV, JSON).
Never commit cooked WebP/Opus into scenario folders — they are build artifacts.

PLATFORM PROFILES:
    web      WebP textures, Opus music (96k), Opus SFX (64k)
    ios      WebP/JPEG textures, AAC music (128k), AAC SFX (96k)
    android  WebP textures, Opus music (96k), Opus SFX (48k)

OUTPUT:
    bundle.box             Uncompressed bundle (always written; used by dev)
    bundle.box.zst         Optional zstd archive (release shipping)
    bundle.box.meta        JSON metadata of logical path -> offset/length/codec
",
    );
}

#[allow(clippy::too_many_arguments)]
fn append_msgpack(
    out: &blackbox_output::Output,
    writer: &mut BundleWriter,
    verbose: bool,
    data_root: &Path,
    source_path: &Path,
    bundle_key: impl Into<String>,
    input_bytes: &[u8],
    encode: EncodeDocument,
) -> Result<()> {
    let bundle_key = bundle_key.into();
    let output_bytes = encode(input_bytes).context("encode content document")?;
    if verbose {
        log_asset_transform(
            out,
            AssetTransformLog {
                actor: "main",
                file: &display_path(source_path),
                relative: &path_relative_to(source_path, data_root),
                input_format: "json",
                input_size: input_bytes.len() as u64,
                output_key: &bundle_key,
                output_codec: EntryCodec::Msgpack,
                output_size: output_bytes.len() as u64,
            },
        );
    }
    writer.append(bundle_key, &output_bytes, EntryCodec::Msgpack);
    Ok(())
}

fn path_relative_to(path: &Path, base: &Path) -> String {
    path.strip_prefix(base)
        .map(|relative| relative.display().to_string())
        .unwrap_or_else(|_| display_path(path))
}

fn display_path(path: &Path) -> String {
    if let (Ok(canonical_path), Ok(cwd)) = (
        path.canonicalize(),
        std::env::current_dir().and_then(|cwd| cwd.canonicalize()),
    ) {
        if let Ok(relative) = canonical_path.strip_prefix(&cwd) {
            return relative.display().to_string();
        }
        return canonical_path.display().to_string();
    }

    if let Ok(cwd) = std::env::current_dir()
        && let Ok(relative) = path.strip_prefix(&cwd)
    {
        return relative.display().to_string();
    }

    path.display().to_string()
}

fn source_format(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
    {
        "json" => "json",
        "png" => "png",
        "webp" => "webp",
        "jpg" | "jpeg" => "jpeg",
        "mp3" => "mp3",
        "ogg" => "ogg",
        "m4a" => "m4a",
        "wav" => "wav",
        _ => "binary",
    }
}

fn resolve_data_root(scenario_path: &Path, data_root: Option<PathBuf>) -> PathBuf {
    if let Some(root) = data_root {
        return root;
    }

    if scenario_path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == "scenario.json")
    {
        return scenario_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("data"));
    }

    scenario_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("data"))
}

struct BundleContext<'a> {
    options: &'a Options,
    out: &'a blackbox_output::Output,
    bundle_files: &'a scenario_io::ScenarioBundleFiles,
    scenario_path: &'a Path,
    scenario_dir: &'a Path,
    data_root: &'a Path,
    scenario_name: &'a str,
}

fn bundle_monolithic(ctx: &BundleContext<'_>, cooked_assets: Vec<cook::CookedAsset>) -> Result<()> {
    let mut writer = BundleWriter::new();
    append_shared_content(
        ctx.out,
        &mut writer,
        ctx.options.verbose,
        ctx.data_root,
        ctx.scenario_path,
        ctx.scenario_dir,
        ctx.bundle_files,
    )?;

    for asset in cooked_assets {
        writer.append(asset.src, &asset.bytes, asset.codec);
    }

    writer.write(
        &ctx.options.output,
        ctx.options.platform.as_str(),
        ctx.scenario_name,
        ctx.options.archive_compression,
    )?;

    let box_path = ctx.options.output.join(format::ARCHIVE_BLOB_NAME);
    let bundle_size = std::fs::metadata(&box_path)
        .with_context(|| format!("stat {}", box_path.display()))?
        .len();
    log_bundle_written(
        ctx.options,
        ctx.out,
        &ctx.options.output,
        bundle_size,
        ctx.scenario_name,
        None,
    );
    Ok(())
}

fn bundle_project(
    ctx: &BundleContext<'_>,
    content: &blackbox::content::GameContent,
    cooked_assets: Vec<cook::CookedAsset>,
) -> Result<()> {
    let split = deps::split_assets_by_chapter(content);
    let mut shared_writer = BundleWriter::new();
    append_shared_content(
        ctx.out,
        &mut shared_writer,
        ctx.options.verbose,
        ctx.data_root,
        ctx.scenario_path,
        ctx.scenario_dir,
        ctx.bundle_files,
    )?;

    let mut chapter_writers: BTreeMap<String, BundleWriter> = BTreeMap::new();
    for chapter in &ctx.bundle_files.chapters {
        chapter_writers.insert(chapter.id.clone(), BundleWriter::new());
    }

    distribute_cooked_assets(
        &mut shared_writer,
        &mut chapter_writers,
        &split,
        cooked_assets,
    )?;

    shared_writer.write_named(format::BundleWriteMeta {
        output_dir: &ctx.options.output,
        bundle_name: SHARED_BUNDLE_NAME,
        platform: ctx.options.platform.as_str(),
        scenario_name: ctx.scenario_name,
        bundle_id: Some(SHARED_BUNDLE_NAME),
        dependencies: &[],
        archive_compression: ctx.options.archive_compression,
    })?;

    let shared_blob = bundle_blob_name(SHARED_BUNDLE_NAME, ctx.options.archive_compression);
    let chapter_dep = vec![SHARED_BUNDLE_NAME.to_string()];
    let chapter_titles: BTreeMap<_, _> = content
        .chapters
        .iter()
        .map(|meta| (meta.id.as_str(), meta.title.as_str()))
        .collect();
    let mut chapter_refs = Vec::with_capacity(ctx.bundle_files.chapters.len());

    for chapter in &ctx.bundle_files.chapters {
        let mut writer = chapter_writers
            .remove(&chapter.id)
            .context("chapter writer missing")?;
        let chapter_path = ctx.scenario_dir.join(&chapter.file_name);
        append_msgpack(
            ctx.out,
            &mut writer,
            ctx.options.verbose,
            ctx.data_root,
            &chapter_path,
            format!("content/chapters/{}", chapter.id),
            &chapter.bytes,
            encode_chapter_document,
        )?;

        writer.write_named(format::BundleWriteMeta {
            output_dir: &ctx.options.output,
            bundle_name: &chapter.id,
            platform: ctx.options.platform.as_str(),
            scenario_name: ctx.scenario_name,
            bundle_id: Some(&chapter.id),
            dependencies: &chapter_dep,
            archive_compression: ctx.options.archive_compression,
        })?;

        let title = chapter_titles
            .get(chapter.id.as_str())
            .copied()
            .unwrap_or(chapter.id.as_str())
            .to_string();

        chapter_refs.push(ChapterBundleRef {
            id: chapter.id.clone(),
            title,
            meta: format!("{}.box.meta", chapter.id),
            blob: bundle_blob_name(&chapter.id, ctx.options.archive_compression),
            dependencies: chapter_dep.clone(),
        });
    }

    let scenario_title = content.title.as_deref().unwrap_or(ctx.scenario_name);
    write_project_map(
        &ctx.options.output,
        ctx.options.platform.as_str(),
        ctx.scenario_name,
        scenario_title,
        content.revision.as_deref(),
        &shared_blob,
        &chapter_refs,
    )?;

    let total_size = project_output_bytes(&ctx.options.output, &ctx.bundle_files.chapters)?;
    log_bundle_written(
        ctx.options,
        ctx.out,
        &ctx.options.output,
        total_size,
        ctx.scenario_name,
        Some(ctx.bundle_files.chapters.len()),
    );
    Ok(())
}

fn project_output_bytes(output: &Path, chapters: &[scenario_io::BundleChapterFile]) -> Result<u64> {
    let mut total = 0u64;
    let paths = [
        output.join(PROJECT_MAP_NAME),
        output.join(format!("{SHARED_BUNDLE_NAME}.box")),
    ]
    .into_iter()
    .chain(
        chapters
            .iter()
            .map(|chapter| output.join(format!("{}.box", chapter.id))),
    );

    for path in paths {
        if path.is_file() {
            total += std::fs::metadata(&path)
                .with_context(|| format!("stat {}", path.display()))?
                .len();
        }
    }
    Ok(total)
}

fn append_shared_content(
    out: &blackbox_output::Output,
    writer: &mut BundleWriter,
    verbose: bool,
    data_root: &Path,
    scenario_path: &Path,
    scenario_dir: &Path,
    bundle_files: &scenario_io::ScenarioBundleFiles,
) -> Result<()> {
    let items_path = scenario_dir.join(&bundle_files.items_file);
    let characters_path = scenario_dir.join(&bundle_files.characters_file);
    let assets_path = scenario_dir.join(&bundle_files.assets_file);
    let shared_docs: [(&Path, &str, &[u8], EncodeDocument); 4] = [
        (
            scenario_path,
            "content/scenario",
            &bundle_files.scenario,
            encode_scenario_document,
        ),
        (
            &items_path,
            "content/items",
            &bundle_files.items,
            encode_items_document,
        ),
        (
            &characters_path,
            "content/characters",
            &bundle_files.characters,
            encode_characters_document,
        ),
        (
            &assets_path,
            "content/assets",
            &bundle_files.assets,
            encode_assets_document,
        ),
    ];

    for (path, bundle_key, bytes, encode) in shared_docs {
        append_msgpack(
            out, writer, verbose, data_root, path, bundle_key, bytes, encode,
        )?;
    }

    if let Some(catalog_bytes) = &bundle_files.catalog {
        let catalog_path = scenario_dir.join(
            bundle_files
                .catalog_file
                .as_deref()
                .unwrap_or("catalog.json"),
        );
        append_msgpack(
            out,
            writer,
            verbose,
            data_root,
            &catalog_path,
            "content/catalog",
            catalog_bytes,
            encode_catalog_document,
        )?;
    }

    if let Some(library_bytes) = &bundle_files.library {
        let library_path = scenario_dir.join(
            bundle_files
                .library_file
                .as_deref()
                .unwrap_or("library.json"),
        );
        append_msgpack(
            out,
            writer,
            verbose,
            data_root,
            &library_path,
            "content/library",
            library_bytes,
            encode_library_document,
        )?;
    }

    Ok(())
}

fn distribute_cooked_assets(
    shared_writer: &mut BundleWriter,
    chapter_writers: &mut BTreeMap<String, BundleWriter>,
    split: &deps::AssetSplit,
    cooked_assets: Vec<cook::CookedAsset>,
) -> Result<()> {
    let mut src_owner: BTreeMap<&str, &str> = BTreeMap::new();
    for (chapter_id, srcs) in &split.chapter_srcs {
        for src in srcs {
            src_owner.insert(src.as_str(), chapter_id.as_str());
        }
    }

    for asset in cooked_assets {
        if split.shared_srcs.contains(&asset.src) {
            shared_writer.append(&asset.src, &asset.bytes, asset.codec);
            continue;
        }

        if let Some(chapter_id) = src_owner.get(asset.src.as_str()) {
            chapter_writers
                .get_mut(*chapter_id)
                .context("chapter writer missing")?
                .append(&asset.src, &asset.bytes, asset.codec);
        } else {
            shared_writer.append(&asset.src, &asset.bytes, asset.codec);
        }
    }
    Ok(())
}

fn log_bundle_written(
    options: &Options,
    out: &blackbox_output::Output,
    output: &Path,
    size: u64,
    scenario_name: &str,
    chapter_count: Option<usize>,
) {
    if options.verbose {
        out.info(format!(
            "wrote {} ({})",
            display_path(output),
            format_byte_size(size)
        ));
    }

    let _ = out.emit(
        || {
            let written = BundleWrittenJson {
                output_path: display_path(output).to_string(),
                size: format_byte_size(size).to_string(),
                scenario: scenario_name.to_string(),
                platform: options.platform.as_str().to_string(),
                chapter_count,
                transcode: !options.skip_transcode,
                archive: options
                    .archive_compression
                    .as_map_value()
                    .unwrap_or("none")
                    .to_string(),
            };
            BundleJson { kind: "bundle", written, result: "ok" }
        },
        || {
            let kind = if chapter_count.is_some() { "project" } else { "bundle" };
            let chapters = chapter_count
                .map(|count| format!(", chapters: {count}"))
                .unwrap_or_default();
            format!(
                "blackbox-bundler — wrote {kind} to {} ({}) (scenario: {scenario_name}, platform: {}{chapters}, transcode: {}, archive: {})\n",
                display_path(output),
                format_byte_size(size),
                options.platform.as_str(),
                !options.skip_transcode,
                options.archive_compression.as_map_value().unwrap_or("none"),
            )
        },
    );
}

#[derive(Debug, Clone)]
struct CollectedAsset {
    kind: AssetKind,
    refs: Vec<String>,
}

fn build_cook_jobs(
    content: &blackbox::content::GameContent,
    data_root: &Path,
    cook_book: Option<&blackbox_bundler::CookBook>,
    skip_missing: bool,
    verbose: bool,
    out: &blackbox_output::Output,
) -> Result<Vec<CookJob>> {
    let assets = collect_assets(content);
    let mut jobs = Vec::with_capacity(assets.len());
    for (src, asset) in assets {
        if blackbox::is_editor_sidecar_src(&src) {
            bail!(
                "asset src '{src}' points at editor-only .blackbox/ storage (e.g. trash or layout); remove it from assets.json"
            );
        }

        let source_path = data_root.join(&src);
        if !source_path.is_file() {
            if skip_missing {
                if verbose {
                    out.info(format!("ignoring missing asset {}", source_path.display()));
                }
                continue;
            }
            bail!("asset file not found: {}", source_path.display());
        }

        let input_size = std::fs::metadata(&source_path)
            .with_context(|| format!("stat {}", source_path.display()))?
            .len();

        let ref_views: Vec<&str> = asset.refs.iter().map(String::as_str).collect();
        let profile = if asset.kind == AssetKind::Texture {
            cook_book
                .map(|book| book.resolve_texture(&src, &ref_views))
                .unwrap_or_default()
        } else {
            TextureCookProfile::default()
        };
        let input_format = source_format(&source_path);
        let source_display = display_path(&source_path);

        jobs.push(CookJob {
            src,
            source_path,
            source_display,
            kind: asset.kind,
            refs: asset.refs,
            profile,
            input_size,
            input_format,
        });
    }
    Ok(jobs)
}

fn collect_assets(content: &blackbox::content::GameContent) -> BTreeMap<String, CollectedAsset> {
    let mut assets: BTreeMap<String, CollectedAsset> = BTreeMap::new();

    let mut push = |src: String, kind: AssetKind, reference: &str| {
        assets
            .entry(src)
            .and_modify(|entry| {
                if entry.kind != kind {
                    // music wins over sfx when sharing a src (existing bundler rule)
                    if kind == AssetKind::Music {
                        entry.kind = kind;
                    }
                }
                if !entry.refs.iter().any(|id| id == reference) {
                    entry.refs.push(reference.to_string());
                }
            })
            .or_insert(CollectedAsset {
                kind,
                refs: vec![reference.to_string()],
            });
    };

    for (id, texture) in &content.assets.textures {
        push(texture.src.clone(), AssetKind::Texture, id);
    }
    for (id, clip) in &content.assets.sfx {
        push(clip.src.clone(), AssetKind::Sfx, id);
    }
    for (id, track) in &content.assets.music {
        push(track.src.clone(), AssetKind::Music, id);
    }

    assets
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use blackbox_bundler::scenario_io::{decode_scenario_bundle_files, read_scenario_bundle_files};

    use super::*;

    #[test]
    fn bundles_sample_scenario_with_skip_transcode() {
        let scenario = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../tests/fixtures/sample_scenario/scenario.json");
        let output =
            std::env::temp_dir().join(format!("blackbox-bundler-test-{}", std::process::id()));

        let options = Options {
            scenario: scenario.clone(),
            output: output.clone(),
            platform: Platform::Web,
            data_root: Some(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/assets")),
            cache_dir: std::env::temp_dir().join("blackbox-bundler-cache-test"),
            ffmpeg: PathBuf::from("ffmpeg"),
            cwebp: PathBuf::from("cwebp"),
            skip_transcode: true,
            skip_missing: false,
            archive_compression: ArchiveCompression::None,
            jobs: 1,
            verbose: false,
            json: false,
        };

        let bundle_files = read_scenario_bundle_files(&scenario).expect("read bundle files");
        let content = decode_scenario_bundle_files(&bundle_files).expect("load scenario");
        let test_out = std::sync::Arc::new(blackbox_output::Output::new(false));
        let tools = MediaTools::new(
            options.ffmpeg.clone(),
            options.cwebp.clone(),
            options.platform,
            true,
            None,
            false,
            std::sync::Arc::clone(&test_out),
        )
        .expect("media tools");
        let cook_jobs = build_cook_jobs(
            &content,
            options.data_root.as_ref().unwrap(),
            None,
            true,
            false,
            &blackbox_output::Output::new(false),
        )
        .expect("cook jobs");
        assert!(
            !cook_jobs.is_empty(),
            "expected at least one on-disk asset for bundler smoke test"
        );
        let cooked_assets = cook_assets(cook_jobs, &tools, options.jobs).expect("cook assets");
        let scenario_dir = scenario.parent().unwrap();
        let ctx = BundleContext {
            options: &options,
            out: &test_out,
            bundle_files: &bundle_files,
            scenario_path: &scenario,
            scenario_dir,
            data_root: options.data_root.as_ref().unwrap(),
            scenario_name: "sample_scenario",
        };
        bundle_project(&ctx, &content, cooked_assets).expect("write project bundle");

        let map_path = output.join(PROJECT_MAP_NAME);
        assert!(map_path.is_file());
        assert!(output.join("shared.box").is_file());
        assert!(output.join("shared.box.meta").is_file());
        for chapter in &bundle_files.chapters {
            assert!(output.join(format!("{}.box", chapter.id)).is_file());
            assert!(output.join(format!("{}.box.meta", chapter.id)).is_file());
        }

        let _ = std::fs::remove_dir_all(output);
    }
}
