use std::collections::HashSet;

use crate::report::{LintIssue, LintReport};
use crate::rules::LintContext;
use crate::rules::source_bundle::{
    collect_referenced_relationship_metrics, is_declared_relationship_metric, load_source_bundle,
    visit_all_string_contexts,
};

pub fn check_undeclared_relationship_metrics(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(bundle) = load_source_bundle(ctx.scenario_path, report) else {
        return;
    };

    if bundle.declared_relationship_metrics.is_empty() {
        return;
    }

    let mut seen = HashSet::new();

    visit_all_string_contexts(&bundle.documents, &mut |context| {
        record_undeclared_metric(context, &bundle, &mut seen, report);
    });
}

pub fn check_unused_relationship_metrics(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(bundle) = load_source_bundle(ctx.scenario_path, report) else {
        return;
    };

    if bundle.declared_relationship_metrics.is_empty() {
        return;
    }

    let referenced = collect_referenced_relationship_metrics(&bundle.documents);

    let mut unused: Vec<(&str, &str)> = Vec::new();
    for (character_id, metrics) in &bundle.declared_relationship_metrics {
        for metric in metrics {
            if !referenced.contains(&(character_id.clone(), metric.clone())) {
                unused.push((character_id.as_str(), metric.as_str()));
            }
        }
    }
    unused.sort_unstable();

    for (character_id, metric) in unused {
        report.push(LintIssue::info(
            "unused-relationship-metric",
            format!(
                "relationship metric '{metric}' on character '{character_id}' is declared but never used"
            ),
        ));
    }
}

fn record_undeclared_metric(
    context: &str,
    bundle: &crate::rules::source_bundle::SourceBundle,
    seen: &mut HashSet<String>,
    report: &mut LintReport,
) {
    let (Some(character_id), Some(metric)) = (
        extract_character_id_from_context(context),
        extract_metric_from_context(context),
    ) else {
        return;
    };

    if is_declared_relationship_metric(&bundle.declared_relationship_metrics, character_id, metric)
    {
        return;
    }

    if !seen.insert(context.to_string()) {
        return;
    }

    let message = if bundle
        .declared_relationship_metrics
        .contains_key(character_id)
    {
        format!("relationship metric '{metric}' is not declared on character '{character_id}'")
    } else {
        format!(
            "relationship metric '{metric}' references character '{character_id}' with no declared relationship metrics"
        )
    };

    report.push(LintIssue::error("undeclared-relationship-metric", message));
}

fn extract_metric_from_context(context: &str) -> Option<&str> {
    let marker = "metric='";
    let start = context.find(marker)? + marker.len();
    let rest = &context[start..];
    let end = rest.find('\'')?;
    Some(&rest[..end])
}

fn extract_character_id_from_context(context: &str) -> Option<&str> {
    let marker = "characterId='";
    let start = context.find(marker)? + marker.len();
    let rest = &context[start..];
    let end = rest.find('\'')?;
    Some(&rest[..end])
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;
    use crate::report::LintReport;

    #[test]
    fn declared_custom_metric_is_allowed() {
        let scenario = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../tests/fixtures/engine_scenario/scenario.json");
        let data_root = scenario.parent().expect("scenario dir");
        let ctx = LintContext {
            scenario_path: &scenario,
            data_root,
            content: None,
        };
        let mut report = LintReport::default();
        check_undeclared_relationship_metrics(&ctx, &mut report);

        assert!(
            !report.issues.iter().any(|issue| {
                issue.code == "undeclared-relationship-metric" && issue.message.contains("rapport")
            }),
            "rapport is declared for oracle_npc and should pass: {:?}",
            report.issues
        );
    }
}
