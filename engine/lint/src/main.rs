mod checks;
mod discover;
mod graph;
mod location;
mod refs;
mod report;
mod rules;
mod scenario_io;

use std::fmt::Write as _;
use std::path::PathBuf;
use std::process::ExitCode;

use anyhow::{Context, Result};

use crate::location::NodeLocationIndex;
use crate::scenario_io::load_bundle_from_path;

use crate::checks::resolve_data_root;
use crate::discover::discover_scenarios;
use crate::report::{LintIssue, LintReport};
use crate::rules::{LintContext, RuleFilter, all_rules, lint_content, lint_scenario};

struct Options {
    target: PathBuf,
    data_root: Option<PathBuf>,
    warnings_as_errors: bool,
    quiet: bool,
    json: bool,
    filter: RuleFilter,
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run() {
        Ok(exit_code) => exit_code,
        Err(error) => {
            let out = blackbox_output::Output::new(args.iter().any(|a| a == "--json"));
            out.error(format!("blackbox-lint: {error:#}"));
            let _ = out.emit(
                || serde_json::json!({ "kind": "lint", "ok": false }),
                String::new,
            );
            ExitCode::from(2)
        }
    }
}

fn run() -> Result<ExitCode> {
    let options = parse_args()?;
    let output = blackbox_output::Output::new(options.json);

    let scenarios = discover_scenarios(&options.target).with_context(|| {
        format!(
            "failed to discover scenarios in {}",
            options.target.display()
        )
    })?;

    if scenarios.is_empty() {
        anyhow::bail!("no scenario files found in {}", options.target.display());
    }

    let mut combined = LintReport::default();
    let mut entries: Vec<(String, String, LintReport)> = Vec::new();

    for scenario_path in &scenarios {
        let data_root = resolve_data_root(scenario_path, options.data_root.clone());
        if !data_root.is_dir() {
            anyhow::bail!("data root does not exist: {}", data_root.display());
        }

        let base_ctx = LintContext {
            scenario_path,
            data_root: &data_root,
            content: None,
        };
        let mut scenario_report = lint_scenario(&base_ctx, &options.filter);

        let node_locations = NodeLocationIndex::new(scenario_path);
        let mut loaded_content = None;

        match load_bundle_from_path(scenario_path) {
            Ok(content) => {
                loaded_content = Some(content);
                lint_content(
                    base_ctx.with_content(loaded_content.as_ref().unwrap()),
                    &mut scenario_report,
                    &options.filter,
                );
            }
            Err(error) => {
                let (code, message) = map_load_error(error);
                scenario_report.push(
                    LintIssue::error(code, message)
                        .with_context(scenario_path.display().to_string()),
                );
            }
        }

        scenario_report.enrich_locations(loaded_content.as_ref(), Some(&node_locations));

        combined.extend(scenario_report.issues.clone());
        entries.push((
            scenario_path.display().to_string(),
            data_root.display().to_string(),
            scenario_report,
        ));
    }

    let failed =
        combined.has_errors() || (options.warnings_as_errors && combined.warning_count() > 0);

    output
        .emit(
            || report::JsonLintOutput {
                kind: "lint",
                scenario_count: entries.len(),
                scenarios: entries
                    .iter()
                    .map(|(path, data_root, report)| report::JsonLintScenario {
                        path: path.clone(),
                        data_root: data_root.clone(),
                        issues: report.issues.clone(),
                        summary: report::make_summary(report),
                        result: report::result_str(report),
                    })
                    .collect(),
                total: report::make_summary(&combined),
                result: report::result_str(&combined),
            },
            || {
                let mut w = String::new();
                let _ = writeln!(w, "blackbox-lint — {} scenario(s)", entries.len());
                for (path, data_root, report) in &entries {
                    let _ = writeln!(w, "\n== {path} == (data root: {data_root})");
                    if !options.quiet || report.has_errors() {
                        report.render(&mut w, options.quiet);
                    }
                    if !options.quiet {
                        summary_into(&mut w, report);
                    }
                }
                let _ = writeln!(w, "\n== total ==");
                summary_into(&mut w, &combined);
                w
            },
        )
        .context("JSON serialisation failed")?;

    Ok(if failed {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    })
}

fn parse_args() -> Result<Options> {
    let mut args = std::env::args().skip(1);
    let mut target = None;
    let mut data_root = None;
    let mut warnings_as_errors = false;
    let mut quiet = false;
    let mut json = false;
    let mut filter = RuleFilter::default();

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--version" | "-V" => {
                blackbox_output::Output::new(false)
                    .print(&format!("blackbox-lint {}\n", env!("CARGO_PKG_VERSION")));
                std::process::exit(0);
            }
            "--warnings-as-errors" => warnings_as_errors = true,
            "--quiet" => quiet = true,
            "--json" => json = true,
            "--data-root" => {
                let value = args
                    .next()
                    .context("--data-root requires a path argument")?;
                data_root = Some(PathBuf::from(value));
            }
            "--ignore" => {
                let value = args
                    .next()
                    .context("--ignore requires a rule ID or category")?;
                filter.ignore.push(value);
            }
            "--only" => {
                let value = args
                    .next()
                    .context("--only requires a rule ID or category")?;
                filter.only.push(value);
            }
            "--list-rules" => {
                print_rules();
                std::process::exit(0);
            }
            "--help" | "-h" => {
                print_help();
                std::process::exit(0);
            }
            value if value.starts_with('-') => {
                anyhow::bail!("unknown flag: {value}");
            }
            value => target = Some(PathBuf::from(value)),
        }
    }

    Ok(Options {
        target: target.unwrap_or_else(|| PathBuf::from("data")),
        data_root,
        warnings_as_errors,
        quiet,
        json,
        filter,
    })
}

fn map_load_error(error: blackbox::EngineError) -> (&'static str, String) {
    match error {
        blackbox::EngineError::ContentDecodeError { message, .. } => ("syntax", message),
        blackbox::EngineError::ValidationError(message) => ("validation", message),
        blackbox::EngineError::ExpressionError(message) => ("expression", message),
        other => ("engine", other.to_string()),
    }
}

fn print_help() {
    blackbox_output::Output::new(false).print(
        "\
blackbox-lint — validate Blackbox scenario bundles

USAGE:
    blackbox-lint [OPTIONS] [TARGET]

TARGET:
    Scenario .json file or directory to scan (default: data)

OPTIONS:
    --data-root <PATH>         Root for asset src paths (default: scenario folder)
    --warnings-as-errors       Treat warnings as failures (exit 1)
    --quiet                    Only print errors
    --json                     Emit a single JSON object to stdout instead of text
    --ignore <id|category>     Skip rules matching this ID or category (repeatable)
    --only <id|category>       Run only rules matching this ID or category (repeatable)
    --list-rules               List all rule IDs and categories, then exit
    -h, --help                 Show this help

CATEGORIES:
    format, characters, catalog, library, engine, navigation, items, assets, references

EXAMPLES:
    blackbox-lint --only characters --only catalog
    blackbox-lint --ignore assets --ignore cook
    blackbox-lint --list-rules

EXTENDING:
    Add rules in engine/lint/src/rules/registry.rs (see README).
",
    );
}

fn print_rules() {
    let mut w = String::new();
    let _ = writeln!(w, "{:<32} CATEGORY", "RULE ID");
    let _ = writeln!(w, "{}", "-".repeat(48));
    for rule in all_rules() {
        let _ = writeln!(w, "{:<32} {}", rule.id, rule.category);
    }
    blackbox_output::Output::new(false).print(&w);
}

fn summary_into(w: &mut String, report: &LintReport) {
    let _ = writeln!(
        w,
        "summary: {} error(s), {} warning(s), {} info",
        report.error_count(),
        report.warning_count(),
        report.info_count()
    );

    if report.has_errors() {
        let _ = writeln!(w, "result: failed");
    } else if report.warning_count() > 0 {
        let _ = writeln!(w, "result: passed with warnings");
    } else {
        let _ = writeln!(w, "result: passed");
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;
    use crate::report::LintIssue;

    #[test]
    fn summary_counts_severities() {
        let mut report = LintReport::default();
        report.push(LintIssue::error("validation", "bad goto"));
        report.push(LintIssue::warning("unreachable", "orphan node"));
        report.push(LintIssue::info("unused-item", "spare key"));

        assert_eq!(report.error_count(), 1);
        assert_eq!(report.warning_count(), 1);
        assert_eq!(report.info_count(), 1);
        assert!(report.has_errors());
    }

    #[test]
    fn resolve_data_root_defaults_to_scenario_dir() {
        let target = Path::new("tests/fixtures/sample_scenario/scenario.json");
        let root = resolve_data_root(target, None);
        assert_eq!(root, PathBuf::from("tests/fixtures/sample_scenario"));
    }
}
