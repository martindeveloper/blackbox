mod discover;
mod fuzzy;
mod harvest;
mod load;

use std::fmt::Write as _;
use std::path::PathBuf;
use std::process::ExitCode;

use anyhow::{Context, Result};
use serde::Serialize;
use serde_json::Value;

use crate::discover::{DEFAULT_IGNORES, discover};
use crate::harvest::{Candidate, Category, collect};

const DEFAULT_TARGET: &str = "data";
const DEFAULT_LIMIT: usize = 50;

struct Options {
    query: String,
    target: PathBuf,
    ignores: Vec<String>,
    enabled: [bool; 9],
    limit: usize,
    full_text: bool,
    json: bool,
}

fn main() -> ExitCode {
    let json = std::env::args().any(|a| a == "--json");
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            let out = blackbox_output::Output::new(json);
            out.error(format!("blackbox-scout: {error:#}"));
            let _ = out.emit(
                || serde_json::json!({ "kind": "scout", "ok": false }),
                String::new,
            );
            ExitCode::from(2)
        }
    }
}

struct Loaded {
    path: String,
    content: blackbox::GameContent,
}

fn run() -> Result<()> {
    let opts = parse_args()?;
    let output = blackbox_output::Output::new(opts.json);

    let manifests = discover(&opts.target, &opts.ignores);
    if manifests.is_empty() {
        anyhow::bail!("no scenario.json found under {}", opts.target.display());
    }
    // A single explicit file must load; in a multi-scenario walk a broken
    // scenario is skipped with a warning rather than failing the whole search.
    let single = opts.target.is_file();

    let mut loaded = Vec::with_capacity(manifests.len());
    for manifest in &manifests {
        match load::load_bundle(manifest) {
            Ok(content) => loaded.push(Loaded {
                path: manifest.display().to_string(),
                content,
            }),
            Err(error) if single => {
                return Err(anyhow::Error::new(error))
                    .with_context(|| format!("failed to load scenario {}", manifest.display()));
            }
            Err(error) => output.warn(format!("skipped {}: {error}", manifest.display())),
        }
    }

    let mut candidates = Vec::new();
    for scenario in &loaded {
        collect(
            &scenario.content,
            &scenario.path,
            &opts.enabled,
            opts.full_text,
            &mut candidates,
        );
    }

    let query = opts.query.to_ascii_lowercase();
    let needle = query.as_bytes();

    let mut scored: Vec<(i32, usize)> = candidates
        .iter()
        .enumerate()
        .filter_map(|(i, c)| {
            let mut best = fuzzy::score(c.id, needle);
            if let Some(label) = fuzzy::score(c.label, needle) {
                best = Some(best.map_or(label, |b| b.max(label)));
            }
            if opts.full_text {
                for frag in &c.text {
                    if let Some(s) = fuzzy::text_score(frag, needle) {
                        best = Some(best.map_or(s, |b| b.max(s)));
                        break;
                    }
                }
            }
            best.map(|s| (s, i))
        })
        .collect();

    // Highest score first; ties resolved by category then id for stable output.
    scored.sort_by(|a, b| {
        b.0.cmp(&a.0).then_with(|| {
            let (x, y) = (&candidates[a.1], &candidates[b.1]);
            (x.cat as usize)
                .cmp(&(y.cat as usize))
                .then_with(|| x.id.cmp(y.id))
        })
    });
    scored.truncate(opts.limit);

    let target = opts.target.display().to_string();
    let hits: Vec<Hit> = scored
        .iter()
        .map(|&(score, i)| {
            let c = &candidates[i];
            let snippet = opts.full_text.then(|| fuzzy::snippet(&c.text, needle)).flatten();
            Hit::new(c, score, snippet)
        })
        .collect();

    output
        .emit(
            || JsonOut {
                kind: "scout",
                query: &opts.query,
                target: &target,
                count: hits.len(),
                results: &hits,
            },
            || render_text(&opts.query, &hits),
        )
        .context("JSON serialisation failed")?;

    Ok(())
}

#[derive(Serialize)]
struct JsonOut<'a> {
    kind: &'static str,
    query: &'a str,
    target: &'a str,
    count: usize,
    results: &'a [Hit<'a>],
}

#[derive(Serialize)]
struct Hit<'a> {
    category: &'static str,
    id: &'a str,
    label: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    chapter: Option<&'a str>,
    scenario: &'a str,
    score: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    snippet: Option<String>,
    focus: Focus,
}

#[derive(Serialize)]
struct Focus {
    route: &'static str,
    params: Value,
}

impl<'a> Hit<'a> {
    fn new(c: &Candidate<'a>, score: i32, snippet: Option<String>) -> Self {
        Hit {
            category: c.cat.name(),
            id: c.id,
            label: c.label,
            chapter: c.chapter,
            scenario: c.scenario,
            score,
            snippet,
            focus: focus_for(c),
        }
    }
}

/// Map a candidate to the editor route and search params that focus it.
fn focus_for(c: &Candidate) -> Focus {
    let (route, params) = match c.cat {
        Category::Chapter => ("/graph", serde_json::json!({ "chapter": c.id })),
        Category::Node => (
            "/graph",
            match c.chapter {
                Some(chapter) => serde_json::json!({ "chapter": chapter, "node": c.id }),
                None => serde_json::json!({ "globalNode": c.id }),
            },
        ),
        Category::Item => ("/items", serde_json::json!({ "item": c.id })),
        Category::Character => ("/characters", serde_json::json!({ "character": c.id })),
        Category::Flag => (
            "/meta",
            serde_json::json!({ "metaKind": "flag", "metaEntry": c.id }),
        ),
        Category::Event => (
            "/meta",
            serde_json::json!({ "metaKind": "event", "metaEntry": c.id }),
        ),
        Category::Texture => (
            "/assets",
            serde_json::json!({ "category": "textures", "key": c.id }),
        ),
        Category::Music => (
            "/assets",
            serde_json::json!({ "category": "music", "key": c.id }),
        ),
        Category::Sfx => (
            "/assets",
            serde_json::json!({ "category": "sfx", "key": c.id }),
        ),
    };
    Focus { route, params }
}

fn render_text(query: &str, hits: &[Hit]) -> String {
    let mut w = String::new();
    let _ = writeln!(
        w,
        "blackbox-scout — {} result(s){}",
        hits.len(),
        if query.is_empty() {
            String::new()
        } else {
            format!(" for \"{query}\"")
        }
    );
    for hit in hits {
        let _ = write!(w, "  {:<10} {}", hit.category, hit.id);
        if hit.label != hit.id {
            let _ = write!(w, "  ·  {}", hit.label);
        }
        let _ = writeln!(w);
    }
    w
}

fn parse_args() -> Result<Options> {
    let mut args = std::env::args().skip(1);
    let mut positional = Vec::new();
    let mut target = None;
    let mut limit = DEFAULT_LIMIT;
    let mut json = false;
    let mut full_text = false;
    let mut enabled = [false; 9];
    let mut any_filter = false;
    let mut ignores: Vec<String> = DEFAULT_IGNORES.iter().map(|s| s.to_string()).collect();
    let mut default_ignores = true;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--version" | "-V" => {
                blackbox_output::Output::new(false)
                    .print(&format!("blackbox-scout {}\n", env!("CARGO_PKG_VERSION")));
                std::process::exit(0);
            }
            "--help" | "-h" => {
                print_help();
                std::process::exit(0);
            }
            "--json" => json = true,
            "--full-text" | "--text" | "-t" => full_text = true,
            "--scenario" | "--path" => {
                target = Some(PathBuf::from(
                    args.next().context("--scenario requires a path")?,
                ));
            }
            "--limit" => {
                limit = args
                    .next()
                    .context("--limit requires a number")?
                    .parse()
                    .context("--limit must be a positive integer")?;
            }
            "--ignore" => {
                let value = args.next().context("--ignore requires a pattern")?;
                ignores.extend(value.split(',').filter(|p| !p.is_empty()).map(str::to_string));
            }
            "--no-default-ignores" => default_ignores = false,
            "--only" => {
                let value = args.next().context("--only requires a category")?;
                for token in value.split(',') {
                    let cats = Category::parse(token)
                        .with_context(|| format!("unknown category: {token}"))?;
                    for &cat in cats {
                        enabled[cat as usize] = true;
                    }
                    any_filter = true;
                }
            }
            value if value.starts_with('-') => anyhow::bail!("unknown flag: {value}"),
            value => positional.push(value.to_string()),
        }
    }

    if !default_ignores {
        ignores.retain(|p| !DEFAULT_IGNORES.contains(&p.as_str()));
    }
    if !any_filter {
        enabled = [true; 9];
    }

    Ok(Options {
        query: positional.join(" "),
        target: target.unwrap_or_else(|| PathBuf::from(DEFAULT_TARGET)),
        ignores,
        enabled,
        limit,
        full_text,
        json,
    })
}

fn print_help() {
    let mut w = String::new();
    let _ = writeln!(w, "blackbox-scout — fast index-free search across a scenario");
    let _ = writeln!(w);
    let _ = writeln!(w, "USAGE:");
    let _ = writeln!(w, "    blackbox-scout [OPTIONS] [QUERY]");
    let _ = writeln!(w);
    let _ = writeln!(w, "OPTIONS:");
    let _ = writeln!(
        w,
        "    --scenario <PATH>   Scenario manifest or directory to walk (default: {DEFAULT_TARGET})"
    );
    let _ = writeln!(
        w,
        "    --only <CATS>       Restrict to categories, comma-separated (repeatable)"
    );
    let _ = writeln!(
        w,
        "    --full-text, -t     Also match entity body text (node prose, choices, descriptions…)"
    );
    let _ = writeln!(
        w,
        "    --ignore <GLOB>     Skip directories matching this glob when walking (repeatable)"
    );
    let _ = writeln!(
        w,
        "    --no-default-ignores  Drop the built-in ignore set (.git, .blackbox, …)"
    );
    let _ = writeln!(
        w,
        "    --limit <N>         Max results (default: {DEFAULT_LIMIT})"
    );
    let _ = writeln!(w, "    --json              Emit a single JSON object to stdout");
    let _ = writeln!(w, "    -h, --help          Show this help");
    let _ = writeln!(w);
    let _ = write!(w, "CATEGORIES:\n    ");
    for (i, cat) in Category::ALL.iter().enumerate() {
        if i > 0 {
            let _ = write!(w, ", ");
        }
        let _ = write!(w, "{}", cat.name());
    }
    let _ = writeln!(w, ", asset (= texture+music+sfx)");
    let _ = writeln!(w);
    let _ = writeln!(w, "EXAMPLES:");
    let _ = writeln!(w, "    blackbox-scout door");
    let _ = writeln!(w, "    blackbox-scout --only item,character knife");
    let _ = writeln!(w, "    blackbox-scout --json --only node intro");
    blackbox_output::Output::new(false).print(&w);
}
