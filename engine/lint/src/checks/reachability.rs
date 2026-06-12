use blackbox::content::{ChoiceAction, GameContent};

use crate::checks::death_nodes::death_redirect_node_ids;
use crate::graph::analyze_reachability;
use crate::report::{LintIssue, LintReport};
use crate::rules::LintContext;

pub fn check_reachability_rule(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(content) = ctx.content else {
        return;
    };
    check_reachability(content, report);
}

pub fn check_reachability(content: &GameContent, report: &mut LintReport) {
    let analysis = analyze_reachability(content);
    let death_nodes = death_redirect_node_ids(content);

    for node_id in content.nodes.keys() {
        if node_id == &content.start_node_id {
            continue;
        }

        if death_nodes.contains(node_id) {
            continue;
        }

        if !analysis.reachable_nodes.contains(node_id) {
            report.push(LintIssue::warning(
                "unreachable",
                format!(
                    "node '{node_id}' is not reachable from start '{}' (including item actions)",
                    content.start_node_id
                ),
            ));
        }
    }

    for node in content.nodes.values() {
        if node.mode.is_terminal() {
            continue;
        }

        let has_restart = node.choices.iter().any(|choice| {
            matches!(
                choice.resolution.action,
                Some(ChoiceAction::RestartGame { .. })
                    | Some(ChoiceAction::OpenLoadMenu)
                    | Some(ChoiceAction::OpenMainMenu)
            )
        });

        if node.choices.is_empty() && !has_restart {
            report.push(LintIssue::info(
                "terminal-node",
                format!(
                    "node '{}' ends with no choices (mark mode game_over or ending if intentional)",
                    node.id
                ),
            ));
        }
    }
}
