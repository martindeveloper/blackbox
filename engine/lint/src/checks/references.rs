use blackbox::content::GameContent;

use crate::refs::collect_content_refs;
use crate::report::{LintIssue, LintReport};
use crate::rules::LintContext;

pub fn check_references_rule(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(content) = ctx.content else {
        return;
    };
    check_references(content, report);
}

pub fn check_references(content: &GameContent, report: &mut LintReport) {
    let refs = collect_content_refs(content);

    for flag in refs.flags_read.difference(&refs.flags_set) {
        report.push(LintIssue::warning(
            "flag-never-set",
            format!("flag '{flag}' is checked but never set by any effect"),
        ));
    }

    for stat in &refs.stats_used {
        if !content.default_stats.contains_key(stat) {
            report.push(LintIssue::warning(
                "unknown-stat",
                format!("stat '{stat}' is referenced but missing from defaultStats"),
            ));
        }
    }

    for error in &refs.text_parse_errors {
        report.push(LintIssue::error(
            "invalid-text-expr",
            format!("invalid text interpolation expression: {error}"),
        ));
    }

    for stat in &refs.text_stats {
        if !content.default_stats.contains_key(stat) {
            report.push(LintIssue::warning(
                "unknown-text-stat",
                format!("text references stat '{stat}' missing from defaultStats"),
            ));
        }
    }

    for item_id in &refs.text_items {
        if !content.items.items.contains_key(item_id) {
            report.push(LintIssue::error(
                "unknown-text-item",
                format!("text references unknown item '{item_id}'"),
            ));
        }
    }

    for flag in &refs.text_flags {
        if !refs.flags_set.contains(flag) && !refs.flags_read.contains(flag) {
            report.push(LintIssue::warning(
                "unknown-text-flag",
                format!("text references flag '{flag}' that is never set in content"),
            ));
        }
    }

    for (item_id, item) in &content.items.items {
        if !refs.item_ids.contains(item_id) {
            report.push(LintIssue::info(
                "unused-item",
                format!("item '{item_id}' ({}) is never referenced", item.name),
            ));
        }
    }

    for node_id in &refs.nodes_visited {
        if !content.nodes.contains_key(node_id) {
            report.push(LintIssue::error(
                "missing-visited-node",
                format!("visited condition references missing node '{node_id}'"),
            ));
        }
    }

    for event_id in &refs.event_ids {
        if !content.meta.events.contains_key(event_id.as_str()) {
            report.push(LintIssue::warning(
                "event-not-in-catalog",
                format!("addEvent references event '{event_id}' not found in catalog"),
            ));
        }
    }

    for id in content.meta.events.keys() {
        if !refs.event_ids.contains(id.as_str()) {
            report.push(LintIssue::warning(
                "catalog-event-never-fired",
                format!("catalog event '{id}' is never fired by any addEvent effect"),
            ));
        }
    }

    for id in content.meta.flags.keys() {
        if !refs.flags_set.contains(id.as_str()) {
            report.push(LintIssue::warning(
                "catalog-flag-never-set",
                format!("catalog flag '{id}' is never set by any setFlag effect"),
            ));
        }
    }
}
