use std::collections::BTreeSet;
use std::fs;

use blackbox_bundler_cook::{resolve_cook_path, validate_cook_file};

use crate::report::{LintIssue, LintReport};
use crate::rules::LintContext;

pub fn check_cook_rules_rule(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(content) = ctx.content else {
        return;
    };
    check_cook_rules(
        &LintContext {
            scenario_path: ctx.scenario_path,
            data_root: ctx.data_root,
            content: Some(content),
        },
        report,
    );
}

pub fn check_cook_rules(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(content) = ctx.content else {
        return;
    };
    let Some(scenario_dir) = ctx.scenario_path.parent() else {
        return;
    };

    let Ok(scenario_bytes) = fs::read(ctx.scenario_path) else {
        report.push(LintIssue::error(
            "cook-read-failed",
            format!("failed to read {}", ctx.scenario_path.display()),
        ));
        return;
    };

    let cook_path = resolve_cook_path(scenario_dir, &scenario_bytes);
    if !cook_path.is_file() {
        return;
    }

    let known_srcs: BTreeSet<&str> = content.assets.src_paths().collect();
    let known_refs: BTreeSet<&str> = content.assets.ref_ids().collect();

    let errors = match validate_cook_file(&cook_path, &known_srcs, &known_refs) {
        Ok(Some(errors)) => errors,
        Ok(None) => return,
        Err(error) => {
            report.push(
                LintIssue::error("cook-parse-failed", error.to_string())
                    .with_context(cook_path.display().to_string()),
            );
            return;
        }
    };

    for err in errors {
        let issue = match err.code {
            "unknown-cook-platform" => LintIssue::info(err.code, err.message),
            _ => LintIssue::error(err.code, err.message),
        };
        report.push(issue.with_context(cook_path.display().to_string()));
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    #[test]
    fn sample_scenario_cook_rules_are_valid() {
        let scenario = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../tests/fixtures/sample_scenario/scenario.json");
        let scenario_dir = scenario.parent().expect("scenario dir");
        let scenario_bytes = std::fs::read(&scenario).expect("read scenario");
        let cook_path = blackbox_bundler_cook::resolve_cook_path(scenario_dir, &scenario_bytes);
        assert!(cook_path.is_file(), "cook file should exist");

        let known_srcs = std::collections::BTreeSet::new();
        let known_refs = std::collections::BTreeSet::new();
        let errors = validate_cook_file(&cook_path, &known_srcs, &known_refs)
            .expect("parse cook file")
            .unwrap_or_default();

        assert!(
            !errors.iter().any(|err| err.code != "unknown-cook-platform"),
            "unexpected cook lint errors: {errors:?}"
        );
    }
}
