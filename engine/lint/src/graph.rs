use std::collections::HashSet;

use blackbox::content::{
    ChoiceAction, ChoiceContent, Effect, GameContent, ItemAction, NodeContent,
};

#[derive(Debug, Default)]
pub struct ReachabilityAnalysis {
    pub reachable_nodes: HashSet<String>,
    pub obtainable_items: HashSet<String>,
}

pub fn analyze_reachability(content: &GameContent) -> ReachabilityAnalysis {
    let mut reachable_nodes = HashSet::new();
    let mut obtainable_items = HashSet::new();
    reachable_nodes.insert(content.start_node_id.clone());

    let mut changed = true;
    while changed {
        changed = false;

        let current_nodes: Vec<String> = reachable_nodes.iter().cloned().collect();
        for node_id in current_nodes {
            let Some(node) = content.nodes.get(&node_id) else {
                continue;
            };

            changed |= apply_add_items(&node.on_enter, &mut obtainable_items);

            for choice in &node.choices {
                for branch in choice_branches(content, choice, &node_id) {
                    changed |= apply_add_items(&branch.effects, &mut obtainable_items);
                    changed |= reachable_nodes.insert(branch.target);
                }
            }
        }

        let current_items: Vec<String> = obtainable_items.iter().cloned().collect();
        for action in item_actions_for(content, &current_items) {
            if let Some(target) = follow_item_action(action) {
                changed |= reachable_nodes.insert(target);
            }
        }
    }

    ReachabilityAnalysis {
        reachable_nodes,
        obtainable_items,
    }
}

struct ChoiceBranch {
    target: String,
    effects: Vec<Effect>,
}

fn apply_add_items(effects: &[Effect], inventory: &mut HashSet<String>) -> bool {
    let mut changed = false;
    for effect in effects {
        if let Effect::AddItem { item_id, .. } = effect {
            changed |= inventory.insert(item_id.clone());
        }
    }
    changed
}

fn follow_item_action(action: &ItemAction) -> Option<String> {
    action.goto.clone()
}

fn item_actions_for<'a>(content: &'a GameContent, inventory: &[String]) -> Vec<&'a ItemAction> {
    let mut actions = Vec::new();
    for item_id in inventory {
        let Some(item) = content.items.items.get(item_id) else {
            continue;
        };
        for action in &item.actions {
            actions.push(action);
        }
    }
    actions
}

fn choice_branches(
    content: &GameContent,
    choice: &ChoiceContent,
    current_node: &str,
) -> Vec<ChoiceBranch> {
    let base_effects = choice.resolution.effects.clone();

    if let Some(check) = &choice.resolution.check {
        let mut branches: Vec<ChoiceBranch> = [&check.on_success, &check.on_failure]
            .into_iter()
            .filter_map(|outcome| {
                let effects = merge_effects(&base_effects, &outcome.effects);
                if outcome.goto.is_none() && effects.is_empty() {
                    return None;
                }
                Some(ChoiceBranch {
                    target: outcome
                        .goto
                        .clone()
                        .unwrap_or_else(|| current_node.to_string()),
                    effects,
                })
            })
            .collect();

        if let Some(exhausted) = &check.on_exhausted {
            let effects = merge_effects(&base_effects, &exhausted.effects);
            if exhausted.goto.is_some() || !effects.is_empty() {
                branches.push(ChoiceBranch {
                    target: exhausted
                        .goto
                        .clone()
                        .unwrap_or_else(|| current_node.to_string()),
                    effects,
                });
            }
        }

        return branches;
    }

    let mut branches = Vec::new();
    if let Some(target) = navigation_target(content, choice) {
        branches.push(ChoiceBranch {
            target,
            effects: base_effects.clone(),
        });
    } else if !base_effects.is_empty() {
        branches.push(ChoiceBranch {
            target: current_node.to_string(),
            effects: base_effects,
        });
    }

    branches
}

fn merge_effects(base: &[Effect], extra: &[Effect]) -> Vec<Effect> {
    base.iter().chain(extra.iter()).cloned().collect()
}

fn navigation_target(content: &GameContent, choice: &ChoiceContent) -> Option<String> {
    match &choice.resolution.action {
        Some(ChoiceAction::RestartGame { start_node_id }) => Some(start_node_id.clone()),
        Some(ChoiceAction::OpenLoadMenu) | Some(ChoiceAction::OpenMainMenu) => {
            choice.resolution.goto.clone()
        }
        Some(ChoiceAction::GotoChapter {
            chapter_id,
            node_id,
        }) => {
            let chapter = content
                .chapters
                .iter()
                .find(|chapter| chapter.id == *chapter_id)?;
            Some(
                node_id
                    .clone()
                    .unwrap_or_else(|| chapter.start_node_id.clone()),
            )
        }
        None => choice.resolution.goto.clone(),
    }
}

pub fn is_terminal_node(node: &NodeContent) -> bool {
    node.mode.is_terminal() || node.choices.is_empty()
}

pub fn choice_has_unconditional_path(choice: &ChoiceContent) -> bool {
    choice.gate.requires.is_none() && choice.gate.when.is_none() && choice.gate.unless.is_none()
}
