use std::sync::{Arc, Mutex};

use rustc_hash::FxHashSet;

use blackbox::command::PlayerCommand;
use blackbox::view::CheckPreview;
use blackbox::view::ItemActionView;
use blackbox::{Engine, SkillCheckOverride};

use crate::issues::{IssueKind, SimIssue};
use crate::playtime::{CompletedPath, count_words_in_view};

use super::abstraction::ValueAbstraction;
use super::work::{ChoiceTaken, PathNode, StateKey, WorkItem};
use super::{SeenSet, SimShared, WorkQueue};

pub const MAX_DEPTH: usize = 500;

/// Per-worker coverage buffer, merged into [`SimShared`] once when the worker
/// drains — node/choice visits happen on every processed item and would
/// otherwise take the shared lock each time.
#[derive(Default)]
struct LocalCoverage {
    nodes: FxHashSet<String>,
    choices: FxHashSet<(String, String)>,
}

impl LocalCoverage {
    fn visit_view(&mut self, view: &blackbox::view::GameView) {
        if !self.nodes.contains(&view.node_id) {
            self.nodes.insert(view.node_id.clone());
        }
        for choice in &view.choices {
            let key = (view.node_id.clone(), choice.id.clone());
            self.choices.insert(key);
        }
    }
}

pub fn worker_loop(
    mut engine: Engine,
    queue: Arc<WorkQueue>,
    shared: Arc<Mutex<SimShared>>,
    seen: Arc<SeenSet>,
    abstraction: Arc<ValueAbstraction>,
    analytics: bool,
) {
    let mut local = LocalCoverage::default();
    while let Some(item) = queue.take() {
        process_work_item(
            &mut engine,
            item,
            &queue,
            &shared,
            &seen,
            &abstraction,
            &mut local,
            analytics,
        );
        queue.complete_item();
    }

    let mut s = shared.lock().expect("shared lock");
    s.coverage.visited_nodes.extend(local.nodes);
    s.coverage.visited_choices.extend(local.choices);
}

#[allow(clippy::too_many_arguments)]
fn process_work_item(
    engine: &mut Engine,
    item: WorkItem,
    queue: &Arc<WorkQueue>,
    shared: &Arc<Mutex<SimShared>>,
    seen: &SeenSet,
    abstraction: &ValueAbstraction,
    local: &mut LocalCoverage,
    analytics: bool,
) {
    let view = match engine.restore_state(item.state.clone()) {
        Ok(v) => v,
        Err(e) => {
            shared
                .lock()
                .expect("shared lock")
                .issues
                .push(SimIssue::error(
                    IssueKind::DeadEnd {
                        node_id: item.state.current_node_id.clone(),
                    },
                    format!("restore_state failed: {e}"),
                ));
            return;
        }
    };

    if item.depth >= MAX_DEPTH {
        shared
            .lock()
            .expect("shared lock")
            .issues
            .push(SimIssue::error(
                IssueKind::InfiniteLoop {
                    node_id: view.node_id.clone(),
                    depth: item.depth,
                },
                item.path_hint(),
            ));
        return;
    }

    if view.mode.is_terminal() {
        local.visit_view(&view);

        // Walk path outside the lock; only pay the alloc cost when analytics is on.
        let path_steps = if analytics {
            let mut steps = Vec::with_capacity(item.depth);
            let mut cur = &item.path_tail;
            while let Some(node) = cur {
                steps.push((node.step.node_id.clone(), node.step.choice_id.clone()));
                cur = &node.parent;
            }
            steps.reverse();
            Some(steps)
        } else {
            None
        };

        let mut s = shared.lock().expect("shared lock");
        s.completed_paths
            .push(CompletedPath::simple(item.word_count, item.depth));
        if let (Some(counts), Some(steps)) = (&mut s.path_counts, path_steps) {
            counts.record_path(&steps, &view.node_id);
        }
        return;
    }

    if view.choices.is_empty() {
        local.nodes.insert(view.node_id.clone());
        let mut s = shared.lock().expect("shared lock");
        if s.reported_dead_ends.insert(view.node_id.clone()) {
            s.issues.push(SimIssue::error(
                IssueKind::DeadEnd {
                    node_id: view.node_id.clone(),
                },
                item.path_hint(),
            ));
        }
        return;
    }

    local.visit_view(&view);

    let enabled: Vec<_> = view.choices.iter().filter(|c| c.enabled).collect();

    if enabled.is_empty() {
        let mut s = shared.lock().expect("shared lock");
        if s.reported_dead_ends.insert(view.node_id.clone()) {
            s.issues.push(SimIssue::error(
                IssueKind::DeadEnd {
                    node_id: view.node_id.clone(),
                },
                format!("{} (all choices disabled)", item.path_hint()),
            ));
        }
        return;
    }

    for choice in &enabled {
        if let Some(check) = &choice.check {
            for override_outcome in skill_check_overrides(check) {
                explore_choice(
                    engine,
                    &item,
                    &view.node_id,
                    choice.id.as_str(),
                    Some(override_outcome),
                    queue,
                    seen,
                    abstraction,
                );
            }
        } else {
            explore_choice(
                engine,
                &item,
                &view.node_id,
                choice.id.as_str(),
                None,
                queue,
                seen,
                abstraction,
            );
        }
    }

    // Also explore enabled item actions — they can set flags, navigate nodes,
    // and are submitted via a separate PlayerCommand::UseItem path the engine exposes.
    let enabled_actions: Vec<_> = view.item_actions.iter().filter(|a| a.enabled).collect();
    for action in &enabled_actions {
        explore_item_action(engine, &item, action, queue, seen, abstraction);
    }
}

fn explore_item_action(
    engine: &mut Engine,
    item: &WorkItem,
    action: &ItemActionView,
    queue: &Arc<WorkQueue>,
    seen: &SeenSet,
    abstraction: &ValueAbstraction,
) {
    if engine.restore_state_no_view(item.state.clone()).is_err() {
        return;
    }
    engine.set_skill_check_override(None);

    let result = engine.submit_command(PlayerCommand::UseItem {
        item_ref: action.item_ref.clone(),
        action_id: Some(action.action_id.clone()),
    });

    if !result.ok {
        return;
    }

    let new_view = match result.view {
        Some(v) => v,
        None => return,
    };

    // Key from a borrow; clone the state only once we know it is unseen —
    // most transitions in a dense graph land on already-seen states.
    let key = StateKey::from_state(engine.get_state(), None, abstraction);
    if !seen.try_admit(key) {
        return;
    }

    let new_state = engine.get_state().clone();

    let new_words = count_words_in_view(&new_view);
    let new_path_tail = Some(Arc::new(PathNode {
        step: ChoiceTaken {
            node_id: format!("{}@use:{}", item.state.current_node_id, action.item_ref),
            choice_id: action.action_id.clone(),
        },
        parent: item.path_tail.clone(),
    }));

    queue.push(WorkItem {
        state: new_state,
        path_tail: new_path_tail,
        depth: item.depth + 1,
        word_count: item.word_count + new_words,
    });
}

/// Returns at most 3 stack-allocated overrides — no heap allocation.
fn skill_check_overrides(check: &CheckPreview) -> impl Iterator<Item = SkillCheckOverride> {
    let n = if check.max_attempts.is_some() { 3 } else { 2 };
    [
        SkillCheckOverride::ForceSuccess,
        SkillCheckOverride::ForceFailure,
        SkillCheckOverride::ForceExhausted,
    ]
    .into_iter()
    .take(n)
}

#[allow(clippy::too_many_arguments)]
fn explore_choice(
    engine: &mut Engine,
    item: &WorkItem,
    node_id: &str,
    choice_id: &str,
    check_override: Option<SkillCheckOverride>,
    queue: &Arc<WorkQueue>,
    seen: &SeenSet,
    abstraction: &ValueAbstraction,
) {
    if engine.restore_state_no_view(item.state.clone()).is_err() {
        return;
    }
    engine.set_skill_check_override(check_override);

    let result = engine.submit_command(PlayerCommand::Choose {
        choice_id: choice_id.to_string(),
    });

    if !result.ok {
        return;
    }

    let new_view = match result.view {
        Some(v) => v,
        None => return,
    };

    let key = StateKey::from_state(engine.get_state(), check_override, abstraction);
    if !seen.try_admit(key) {
        return;
    }

    let new_state = engine.get_state().clone();

    let new_words = count_words_in_view(&new_view);

    let new_path_tail = Some(Arc::new(PathNode {
        step: ChoiceTaken {
            node_id: node_id.to_string(),
            choice_id: choice_id.to_string(),
        },
        parent: item.path_tail.clone(),
    }));

    queue.push(WorkItem {
        state: new_state,
        path_tail: new_path_tail,
        depth: item.depth + 1,
        word_count: item.word_count + new_words,
    });
}
