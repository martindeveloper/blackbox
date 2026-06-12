use std::collections::{HashSet, VecDeque};

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
    let mut seen_states: HashSet<(String, Vec<String>)> = HashSet::new();
    let mut queue = VecDeque::new();

    let start_inventory = HashSet::new();
    queue.push_back((content.start_node_id.clone(), start_inventory));
    reachable_nodes.insert(content.start_node_id.clone());

    while let Some((node_id, inventory)) = queue.pop_front() {
        let mut inventory_key: Vec<String> = inventory.iter().cloned().collect();
        inventory_key.sort();
        if !seen_states.insert((node_id.clone(), inventory_key)) {
            continue;
        }

        for item_id in &inventory {
            obtainable_items.insert(item_id.clone());
        }

        let Some(node) = content.nodes.get(&node_id) else {
            continue;
        };

        let mut inv = inventory.clone();
        apply_add_items(&node.on_enter, &mut inv);

        for item_id in &inv {
            obtainable_items.insert(item_id.clone());
        }

        for (item_id, action) in item_actions_for(content, &inv) {
            if let Some(target) = follow_item_action(&action, &mut inv, &item_id) {
                enqueue_state(&mut queue, &mut reachable_nodes, target, inv.clone());
            }
        }

        for choice in &node.choices {
            for branch in choice_branches(content, choice, &node_id) {
                let mut branch_inv = inv.clone();
                apply_add_items(&branch.effects, &mut branch_inv);
                enqueue_state(&mut queue, &mut reachable_nodes, branch.target, branch_inv);
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

fn enqueue_state(
    queue: &mut VecDeque<(String, HashSet<String>)>,
    reachable_nodes: &mut HashSet<String>,
    target: String,
    inventory: HashSet<String>,
) {
    reachable_nodes.insert(target.clone());
    queue.push_back((target, inventory));
}

fn apply_add_items(effects: &[Effect], inventory: &mut HashSet<String>) {
    for effect in effects {
        if let Effect::AddItem { item_id, .. } = effect {
            inventory.insert(item_id.clone());
        }
    }
}

fn follow_item_action(
    action: &ItemAction,
    inventory: &mut HashSet<String>,
    item_id: &str,
) -> Option<String> {
    let target = action.goto.clone()?;
    if action.consume {
        inventory.remove(item_id);
    }
    Some(target)
}

fn item_actions_for(
    content: &GameContent,
    inventory: &HashSet<String>,
) -> Vec<(String, ItemAction)> {
    let mut actions = Vec::new();
    for item_id in inventory {
        let Some(item) = content.items.items.get(item_id) else {
            continue;
        };
        for action in &item.actions {
            actions.push((item_id.clone(), action.clone()));
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
