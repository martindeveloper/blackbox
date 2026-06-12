use blackbox::content::{ChoiceAction, GameContent, NodeMode};

use crate::graph::{choice_has_unconditional_path, is_terminal_node};
use crate::report::{LintIssue, LintReport};
use crate::rules::LintContext;

pub fn check_dead_ends_rule(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(content) = ctx.content else {
        return;
    };
    check_dead_ends(content, report);
}

pub fn check_dead_ends(content: &GameContent, report: &mut LintReport) {
    for node in content.nodes.values() {
        if is_terminal_node(node) {
            if node.mode == NodeMode::GameOver || node.mode == NodeMode::Ending {
                let has_recovery = node.choices.iter().any(|choice| {
                    matches!(
                        choice.resolution.action,
                        Some(ChoiceAction::RestartGame { .. })
                            | Some(ChoiceAction::OpenLoadMenu)
                            | Some(ChoiceAction::OpenMainMenu)
                    )
                });

                if !has_recovery && !node.choices.is_empty() {
                    report.push(LintIssue::warning(
                        "game-over-no-recovery",
                        format!(
                            "terminal node '{}' has choices but none restart, open the load menu, or return to main menu",
                            node.id
                        ),
                    ));
                }
            }
            continue;
        }

        if node.choices.is_empty() {
            continue;
        }

        let all_gated = node
            .choices
            .iter()
            .all(|choice| !choice_has_unconditional_path(choice));

        if all_gated {
            report.push(LintIssue::warning(
                "all-choices-gated",
                format!(
                    "node '{}' may soft-lock: every choice has requires/when/unless gates",
                    node.id
                ),
            ));
        }

        for choice in &node.choices {
            let stays_on_node = choice.resolution.goto.as_deref() == Some(node.id.as_str())
                || choice.resolution.check.as_ref().is_some_and(|check| {
                    check.on_success.goto.as_deref() == Some(node.id.as_str())
                        && check.on_failure.goto.as_deref() == Some(node.id.as_str())
                });

            let has_state_change = !choice.resolution.effects.is_empty()
                || choice.resolution.check.as_ref().is_some_and(|check| {
                    !check.on_success.effects.is_empty() || !check.on_failure.effects.is_empty()
                });

            if stays_on_node && !has_state_change {
                report.push(LintIssue::info(
                    "idle-loop",
                    format!(
                        "choice '{}' in node '{}' loops without changing state",
                        choice.presentation.id, node.id
                    ),
                ));
            }
        }
    }
}
