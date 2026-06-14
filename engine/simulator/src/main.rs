mod issues;
mod playtime;
mod report;
mod scenario_io;
mod sim;

/// The search workloads are allocation-bound (GameState clones on every
/// transition, across many threads); mimalloc's per-thread heaps remove the
/// system-allocator contention that otherwise dominates the profile.
#[cfg(not(target_os = "windows"))]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use anyhow::{Context, Result, bail};

use std::sync::Arc;

use blackbox::logging::{self, LogLevel, LogSink};

use crate::issues::IssueSeverity;
use crate::sim::{GoalFilter, GoalTarget, SimConfig, SimMode};

/// Discards all engine log output. The simulator produces its own structured
/// report so engine-internal info/debug noise is not useful to the user.
struct NullSink;
impl LogSink for NullSink {
    fn write(&self, _level: LogLevel, _formatted: &str) {}
}

struct Options {
    scenario_dir: PathBuf,
    mode: SimMode,
    goal_target: Option<GoalTarget>,
    threads: usize,
    max_states: usize,
    goal_budget: usize,
    use_heuristic: bool,
    check_mode: bool,
    verbose: bool,
    analytics: bool,
    json: bool,
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().is_some_and(|a| a == "--version" || a == "-V") {
        blackbox_output::Output::new(false).print(&format!(
            "blackbox-simulator {}\n",
            env!("CARGO_PKG_VERSION")
        ));
        return ExitCode::SUCCESS;
    }

    match run() {
        Ok(code) => code,
        Err(err) => {
            let out = blackbox_output::Output::new(args.iter().any(|a| a == "--json"));
            out.error(format!("blackbox-simulator: {err:#}"));
            let _ = out.emit(
                || serde_json::json!({ "kind": "simulator", "ok": false }),
                String::new,
            );
            ExitCode::from(2)
        }
    }
}

fn run() -> Result<ExitCode> {
    logging::set_log_sink(Arc::new(NullSink));

    let options = parse_args()?;

    let scenario_path = resolve_scenario_path(&options.scenario_dir).with_context(|| {
        format!(
            "no scenario.json found in {}",
            options.scenario_dir.display()
        )
    })?;

    let content = scenario_io::load_bundle_from_path(&scenario_path)
        .with_context(|| format!("failed to load scenario from {}", scenario_path.display()))?;

    let output = blackbox_output::Output::new(options.json);

    let (budget_label, sim_mode) = match options.mode {
        SimMode::Explore => (
            format!("max {} states", fmt_count(options.max_states)),
            SimMode::Explore,
        ),
        SimMode::Goals => (
            format!(
                "{} goals × {} states",
                goal_target_label(&options.goal_target),
                fmt_count(options.goal_budget),
            ),
            SimMode::Goals,
        ),
    };

    if !options.json {
        let mut header = String::new();
        report::print_header(
            &mut header,
            &content,
            sim_mode,
            options.threads,
            &budget_label,
        );
        output.print(&header);
    }

    let goal_target = options
        .goal_target
        .clone()
        .unwrap_or(GoalTarget::Filter(GoalFilter::Ending));

    let content_for_json = if options.json {
        Some(content.clone())
    } else {
        None
    };

    let sim_config = SimConfig {
        content,
        mode: options.mode,
        threads: options.threads,
        max_states: options.max_states,
        goal_budget: options.goal_budget,
        goal_target,
        use_heuristic: options.use_heuristic,
        analytics: options.analytics,
    };

    let result = sim::run_simulation(sim_config).context("simulation failed")?;

    output
        .emit(
            || {
                report::build_json(
                    content_for_json.as_ref().expect("content_for_json set"),
                    &result,
                )
            },
            || {
                let mut buf = String::new();
                report::print_sim_results(&mut buf, &result, options.verbose);
                report::print_playtime(&mut buf, &result);
                report::print_analytics(&mut buf, &result);
                report::print_summary(&mut buf, &result);
                buf
            },
        )
        .context("JSON serialisation failed")?;

    if options.check_mode
        && result
            .issues
            .iter()
            .any(|i| i.severity == IssueSeverity::Error)
    {
        Ok(ExitCode::from(1))
    } else {
        Ok(ExitCode::SUCCESS)
    }
}

fn goal_target_label(target: &Option<GoalTarget>) -> String {
    match target {
        Some(GoalTarget::Filter(GoalFilter::Ending)) | None => "ending".to_string(),
        Some(GoalTarget::Filter(GoalFilter::GameOver)) => "game_over".to_string(),
        Some(GoalTarget::Filter(GoalFilter::All)) => "all".to_string(),
        Some(GoalTarget::Node(id)) => id.clone(),
    }
}

fn resolve_scenario_path(dir: &Path) -> Option<PathBuf> {
    let candidate = dir.join("scenario.json");
    if candidate.is_file() {
        return Some(candidate);
    }
    if dir.is_file() && dir.file_name().is_some_and(|n| n == "scenario.json") {
        return Some(dir.to_path_buf());
    }
    None
}

fn parse_args() -> Result<Options> {
    let mut args = std::env::args().skip(1);
    let mut scenario_dir: Option<PathBuf> = None;
    let mut mode = SimMode::Goals;
    let mut goal_target: Option<GoalTarget> = None;
    let mut threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let mut max_states: usize = 500_000;
    let mut goal_budget: usize = 50_000;
    let mut use_heuristic = true;
    let mut check_mode = false;
    let mut verbose = false;
    let mut analytics = false;
    let mut json = false;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--threads" => {
                let val = args.next().context("--threads requires a value")?;
                threads = val
                    .parse::<usize>()
                    .context("--threads must be a positive integer")?;
                if threads == 0 {
                    bail!("--threads must be at least 1");
                }
            }
            "--max-states" => {
                let val = args.next().context("--max-states requires a value")?;
                max_states = val
                    .parse::<usize>()
                    .context("--max-states must be a positive integer")?;
                if max_states == 0 {
                    bail!("--max-states must be at least 1");
                }
            }
            "--goal-budget" => {
                let val = args.next().context("--goal-budget requires a value")?;
                goal_budget = val
                    .parse::<usize>()
                    .context("--goal-budget must be a positive integer")?;
                if goal_budget == 0 {
                    bail!("--goal-budget must be at least 1");
                }
            }
            "--goals" => {
                mode = SimMode::Goals;
                let val = args.next().context("--goals requires a value")?;
                goal_target = Some(parse_goal_target(&val)?);
            }
            "--mode" => {
                let val = args.next().context("--mode requires a value")?;
                mode = match val.as_str() {
                    "explore" => SimMode::Explore,
                    "goals" => SimMode::Goals,
                    other => bail!("unknown mode: {other} (expected explore or goals)"),
                };
            }
            "--heuristic" => {
                let val = args.next().context("--heuristic requires a value")?;
                use_heuristic = match val.as_str() {
                    "graph" => true,
                    "none" => false,
                    other => bail!("unknown heuristic: {other} (expected graph or none)"),
                };
            }
            "--check" => check_mode = true,
            "--verbose" => verbose = true,
            "--analytics" => analytics = true,
            "--json" => json = true,
            "--version" | "-V" => {
                blackbox_output::Output::new(false).print(&format!(
                    "blackbox-simulator {}\n",
                    env!("CARGO_PKG_VERSION")
                ));
                std::process::exit(0);
            }
            "--help" | "-h" => {
                print_usage();
                std::process::exit(0);
            }
            arg if arg.starts_with('-') => {
                bail!("unknown option: {arg}");
            }
            path => {
                if scenario_dir.is_some() {
                    bail!("unexpected extra argument: {path}");
                }
                scenario_dir = Some(PathBuf::from(path));
            }
        }
    }

    let scenario_dir = scenario_dir.context("missing required argument: <scenario-dir>")?;

    if goal_target.is_none() && mode == SimMode::Goals {
        goal_target = Some(GoalTarget::Filter(GoalFilter::Ending));
    }

    Ok(Options {
        scenario_dir,
        mode,
        goal_target,
        threads,
        max_states,
        goal_budget,
        use_heuristic,
        check_mode,
        verbose,
        analytics,
        json,
    })
}

fn parse_goal_target(value: &str) -> Result<GoalTarget> {
    if let Some(filter) = GoalFilter::parse(value) {
        return Ok(GoalTarget::Filter(filter));
    }
    Ok(GoalTarget::Node(value.to_string()))
}

fn print_usage() {
    blackbox_output::Output::new(false).print(
        "Usage: blackbox-simulator [OPTIONS] <scenario-dir>

Arguments:
  <scenario-dir>       Path to scenario directory (e.g. data/silent_archive_game)

Options:
  --mode <explore|goals>  Simulation mode [default: goals]
  --goals <FILTER>        Goal filter: ending, game_over, all, or node id
                          [default when mode=goals: ending]
  --goal-budget <N>       Per-goal state budget [default: 50000]
  --heuristic <graph|none>  Goal search ordering [default: graph]
  --threads <N>           Worker threads [default: available CPUs]
  --max-states <N>        Explore-mode state budget [default: 500000]
  --check                 Exit code 1 if any Error-severity issues found
  --verbose               Show unvisited nodes/choices (explore mode)
  --analytics             Print narrative analytics (node importance, hot paths)
  --json                  Emit a single JSON object to stdout instead of text
  -V, --version            Print version
  -h, --help              Print this help",
    );
}

fn fmt_count(n: usize) -> String {
    if n >= 1_000_000 {
        format!("{:.1}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        format!("{:.1}K", n as f64 / 1_000.0)
    } else {
        n.to_string()
    }
}
