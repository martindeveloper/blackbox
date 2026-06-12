use std::collections::HashSet;

use crate::report::{LintIssue, LintReport};
use crate::rules::LintContext;
use crate::rules::source_bundle::{load_source_bundle, visit_all_string_contexts};

pub fn check_flags_not_in_catalog(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(bundle) = load_source_bundle(ctx.scenario_path, report) else {
        return;
    };

    if bundle.catalog_flags.is_empty() {
        return;
    }

    let mut seen = HashSet::new();

    visit_all_string_contexts(&bundle.documents, &mut |context| {
        record_flag_not_in_catalog(context, &bundle.catalog_flags, &mut seen, report);
    });
}

fn record_flag_not_in_catalog(
    context: &str,
    catalog_flags: &HashSet<String>,
    seen: &mut HashSet<String>,
    report: &mut LintReport,
) {
    if !context.contains("setFlag flag='") {
        return;
    }

    let Some(flag) = extract_flag_from_context(context) else {
        return;
    };

    if catalog_flags.contains(flag) {
        return;
    }

    if !seen.insert(format!("{flag}:{context}")) {
        return;
    }

    report.push(
        LintIssue::warning(
            "flag-not-in-catalog",
            format!("setFlag references flag '{flag}' not found in catalog"),
        )
        .with_context(context),
    );
}

fn extract_flag_from_context(context: &str) -> Option<&str> {
    let marker = "setFlag flag='";
    let start = context.find(marker)? + marker.len();
    let rest = &context[start..];
    let end = rest.find('\'')?;
    Some(&rest[..end])
}
