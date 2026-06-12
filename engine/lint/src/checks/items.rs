use blackbox::content::GameContent;

use crate::graph::analyze_reachability;
use crate::refs::collect_content_refs;
use crate::report::{LintIssue, LintReport};
use crate::rules::LintContext;

pub fn check_items_rule(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(content) = ctx.content else {
        return;
    };
    check_items(content, report);
}

pub fn check_items(content: &GameContent, report: &mut LintReport) {
    let refs = collect_content_refs(content);
    let analysis = analyze_reachability(content);

    for item_id in &refs.items_required {
        if !analysis.obtainable_items.contains(item_id) {
            let granted = refs.items_granted.contains(item_id);
            let message = if granted {
                format!(
                    "item '{item_id}' is required but not obtainable on any path from start (addItem exists but is unreachable)"
                )
            } else {
                format!("item '{item_id}' is required but never granted by any addItem effect")
            };
            report.push(LintIssue::warning("item-unobtainable", message));
        }
    }
}
