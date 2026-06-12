use std::cmp::Ordering;
use std::collections::BinaryHeap;
use std::sync::Arc;

use anyhow::Result;
use blackbox::command::PlayerCommand;
use blackbox::content::ChoiceContent;
use blackbox::view::{CheckPreview, ItemActionView};
use blackbox::{Engine, GameContent, GameState, SkillCheckOverride};
use rustc_hash::FxHashSet;

use crate::issues::{IssueKind, SimIssue};
use crate::playtime::{CompletedPath, GoalWitness, count_words_in_view};
use crate::sim::abstraction::ValueAbstraction;
use crate::sim::goals::{GoalPlan, Milestones};
use crate::sim::graph::{DIST_UNREACHABLE, Distances, GraphIndex};
use crate::sim::preconditions::GoalPreconditions;
use crate::sim::work::{ChoiceTaken, PathNode, StateKey, WorkItem};

pub const MAX_DEPTH: usize = 500;

pub struct GoalSearchConfig<'a> {
    pub content: &'a GameContent,
    pub graph: &'a GraphIndex,
    pub plan: &'a GoalPlan,
    pub dist: &'a Distances,
    pub milestones: &'a Milestones,
    pub abstraction: &'a ValueAbstraction,
    pub max_states: usize,
    pub use_heuristic: bool,
    /// Reused across searches — constructing an engine clones and revalidates
    /// the whole `GameContent`, which dwarfs the search itself for easy goals.
    pub engine: &'a mut Engine,
    /// Fresh-game state (post on-enter effects), computed once by the caller.
    pub initial_state: &'a GameState,
    /// Word count of the fresh-game view, computed once by the caller.
    pub initial_words: u32,
}

pub struct GoalSearchResult {
    pub reached: bool,
    pub states_explored: usize,
    pub budget_exhausted: bool,
    pub issues: Vec<SimIssue>,
    pub completed_path: Option<CompletedPath>,
    pub closest_node: Option<String>,
    pub closest_milestone: Option<String>,
    pub missing_preconditions: Vec<String>,
    /// Every `(node_id, visible_choice_ids)` view the search actually visited.
    /// Used by explore-mode coverage completion: recording what the search saw
    /// in-flight is faithful (correct skill-check branch, correct gate state),
    /// whereas replaying the witness would diverge at forced skill checks.
    pub visited_views: Vec<(String, Vec<String>)>,
}

struct PrioritizedItem {
    priority: u32,
    depth: usize,
    item: WorkItem,
}

impl Ord for PrioritizedItem {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .priority
            .cmp(&self.priority)
            .then_with(|| other.depth.cmp(&self.depth))
    }
}

impl PartialOrd for PrioritizedItem {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Eq for PrioritizedItem {}

impl PartialEq for PrioritizedItem {
    fn eq(&self, other: &Self) -> bool {
        self.priority == other.priority && self.depth == other.depth
    }
}

struct NearMiss {
    satisfied: usize,
    graph_dist: u32,
    missing: Vec<String>,
    milestone: Option<String>,
}

pub fn run_goal_search(config: GoalSearchConfig<'_>) -> Result<GoalSearchResult> {
    let GoalSearchConfig {
        content,
        graph,
        plan,
        dist,
        milestones,
        abstraction,
        max_states,
        use_heuristic,
        engine,
        initial_state,
        initial_words,
    } = config;

    let preconditions = &plan.preconditions;
    let goal_id = &plan.goal_id;

    let initial_state = initial_state.clone();
    let start_idx = graph.index_of(&initial_state.current_node_id).unwrap_or(0);
    let start_priority = initial_priority(
        preconditions,
        &initial_state,
        start_idx,
        dist,
        use_heuristic,
    );

    let initial_key = StateKey::from_state(&initial_state, None, abstraction);
    let initial = WorkItem {
        state: initial_state,
        path_tail: None,
        depth: 0,
        word_count: initial_words,
    };

    let mut seen: FxHashSet<StateKey> = FxHashSet::default();
    seen.insert(initial_key);

    let mut heap = BinaryHeap::new();
    heap.push(PrioritizedItem {
        priority: start_priority,
        depth: 0,
        item: initial,
    });

    let mut states_explored = 1usize;
    let mut issues = Vec::new();
    let mut reached = false;
    let mut completed_path = None;
    let mut visited_views: Vec<(String, Vec<String>)> = Vec::new();

    // Dense bitset for O(1) visited check; separate list for milestone / closest queries.
    let n = graph.len();
    let mut visited_bits = vec![false; n];
    let mut visited_list: Vec<u32> = Vec::with_capacity(n.min(256));
    visited_bits[start_idx as usize] = true;
    visited_list.push(start_idx);

    let mut near_miss = initial_near_miss(
        preconditions,
        &heap.peek().expect("heap").item.state,
        start_idx,
        dist,
        milestones,
        &visited_bits,
    );

    while let Some(PrioritizedItem { item, .. }) = heap.pop() {
        if reached {
            break;
        }
        if states_explored > max_states {
            break;
        }

        let view = match engine.restore_state(item.state.clone()) {
            Ok(v) => v,
            Err(e) => {
                issues.push(SimIssue::error(
                    IssueKind::DeadEnd {
                        node_id: item.state.current_node_id.clone(),
                    },
                    format!("restore_state failed: {e}"),
                ));
                continue;
            }
        };

        // Record exactly what this state shows — its node and the choices visible
        // in this gate state — so coverage completion can mark them faithfully.
        visited_views.push((
            view.node_id.clone(),
            view.choices.iter().map(|c| c.id.clone()).collect(),
        ));

        if let Some(idx) = graph.index_of(&view.node_id) {
            if !visited_bits[idx as usize] {
                visited_bits[idx as usize] = true;
                visited_list.push(idx);
            }
            update_near_miss(
                preconditions,
                &item.state,
                idx,
                dist,
                milestones,
                &visited_bits,
                &mut near_miss,
            );
        }

        if item.depth >= MAX_DEPTH {
            issues.push(SimIssue::error(
                IssueKind::InfiniteLoop {
                    node_id: view.node_id.clone(),
                    depth: item.depth,
                },
                item.path_hint(),
            ));
            continue;
        }

        if view.node_id == *goal_id {
            reached = true;
            let witness = build_witness(&item, preconditions, engine);
            completed_path = Some(CompletedPath {
                word_count: item.word_count,
                choice_count: item.depth,
                witness: Some(witness),
            });
            continue;
        }

        if view.mode.is_terminal() {
            continue;
        }

        if view.choices.is_empty() {
            if issues.iter().all(|i| {
                !matches!(
                    &i.kind,
                    IssueKind::DeadEnd { node_id } if node_id == &view.node_id
                )
            }) {
                issues.push(SimIssue::error(
                    IssueKind::DeadEnd {
                        node_id: view.node_id.clone(),
                    },
                    item.path_hint(),
                ));
            }
            continue;
        }

        let enabled: Vec<_> = view.choices.iter().filter(|c| c.enabled).collect();
        if enabled.is_empty() {
            continue;
        }

        let node = match content.nodes.get(&view.node_id) {
            Some(n) => n,
            None => continue,
        };

        let mut ranked_choices: Vec<_> = enabled
            .iter()
            .filter_map(|choice_view| {
                let choice_idx = node
                    .choices
                    .iter()
                    .position(|c| c.presentation.id == choice_view.id)?;
                if !plan.slice.contains_id(graph, &view.node_id)
                    || !graph.choice_in_slice(&view.node_id, choice_idx, &plan.slice)
                {
                    return None;
                }
                let choice = &node.choices[choice_idx];
                let bonus = preconditions.choice_progress_bonus(choice, &item.state);
                Some((choice_view, choice, bonus))
            })
            .collect();
        ranked_choices.sort_by_key(|c| std::cmp::Reverse(c.2));

        for (choice_view, choice, _) in ranked_choices {
            if let Some(check) = &choice_view.check {
                for override_outcome in skill_check_overrides(check) {
                    try_enqueue(
                        engine,
                        &item,
                        &view.node_id,
                        choice,
                        choice_view.id.as_str(),
                        Some(override_outcome),
                        graph,
                        dist,
                        preconditions,
                        abstraction,
                        use_heuristic,
                        max_states,
                        &mut seen,
                        &mut states_explored,
                        &mut heap,
                    );
                }
            } else {
                try_enqueue(
                    engine,
                    &item,
                    &view.node_id,
                    choice,
                    choice_view.id.as_str(),
                    None,
                    graph,
                    dist,
                    preconditions,
                    abstraction,
                    use_heuristic,
                    max_states,
                    &mut seen,
                    &mut states_explored,
                    &mut heap,
                );
            }
        }

        // Enabled item actions are also state transitions — explore them too.
        for action in view.item_actions.iter().filter(|a| a.enabled) {
            try_enqueue_item_action(
                engine,
                &item,
                action,
                graph,
                dist,
                preconditions,
                abstraction,
                use_heuristic,
                max_states,
                &mut seen,
                &mut states_explored,
                &mut heap,
            );
        }
    }

    let closest_idx = dist.closest_among(&visited_list);
    let closest_node = closest_idx.map(|idx| graph.id_of(idx).to_string());
    let closest_milestone = milestones
        .best_reached(&visited_bits, dist)
        .map(|m| format!("{} ({})", m.title, m.node_id));

    let budget_exhausted = !reached && states_explored >= max_states;
    let missing_preconditions = near_miss.missing.clone();

    Ok(GoalSearchResult {
        reached,
        states_explored,
        budget_exhausted,
        issues,
        completed_path,
        closest_node,
        closest_milestone,
        missing_preconditions,
        visited_views,
    })
}

fn initial_priority(
    preconditions: &GoalPreconditions,
    state: &blackbox::GameState,
    node_idx: u32,
    _dist: &Distances,
    use_heuristic: bool,
) -> u32 {
    if use_heuristic || !preconditions.requirements.is_empty() {
        preconditions.search_priority(state, node_idx)
    } else {
        0
    }
}

fn initial_near_miss(
    preconditions: &GoalPreconditions,
    state: &blackbox::GameState,
    node_idx: u32,
    dist: &Distances,
    milestones: &Milestones,
    visited: &[bool],
) -> NearMiss {
    NearMiss {
        satisfied: preconditions.satisfied_count(state),
        graph_dist: dist.get(node_idx),
        missing: preconditions.missing_labels(state),
        milestone: milestones
            .best_reached(visited, dist)
            .map(|m| format!("{} ({})", m.title, m.node_id)),
    }
}

fn update_near_miss(
    preconditions: &GoalPreconditions,
    state: &blackbox::GameState,
    node_idx: u32,
    dist: &Distances,
    milestones: &Milestones,
    visited: &[bool],
    near_miss: &mut NearMiss,
) {
    if preconditions.requirements.is_empty() {
        return;
    }
    let satisfied = preconditions.satisfied_count(state);
    let graph_dist = dist.get(node_idx);
    let better = satisfied > near_miss.satisfied
        || (satisfied == near_miss.satisfied && graph_dist < near_miss.graph_dist);
    if better {
        near_miss.satisfied = satisfied;
        near_miss.graph_dist = graph_dist;
        near_miss.missing = preconditions.missing_labels(state);
        near_miss.milestone = milestones
            .best_reached(visited, dist)
            .map(|m| format!("{} ({})", m.title, m.node_id));
    }
}

fn build_witness(
    item: &WorkItem,
    preconditions: &GoalPreconditions,
    engine: &Engine,
) -> GoalWitness {
    // Walk the persistent linked list tail-to-head, then reverse.
    let mut steps: Vec<(String, String)> = Vec::new();
    let mut cur = &item.path_tail;
    while let Some(node) = cur {
        steps.push((node.step.node_id.clone(), node.step.choice_id.clone()));
        cur = &node.parent;
    }
    steps.reverse();

    let gateway_snapshot = preconditions.gateway_snapshot(engine.get_state());
    GoalWitness {
        steps,
        gateway_snapshot,
    }
}

#[allow(clippy::too_many_arguments)]
fn try_enqueue(
    engine: &mut Engine,
    item: &WorkItem,
    node_id: &str,
    choice: &ChoiceContent,
    choice_id: &str,
    check_override: Option<SkillCheckOverride>,
    graph: &GraphIndex,
    dist: &Distances,
    preconditions: &GoalPreconditions,
    abstraction: &ValueAbstraction,
    use_heuristic: bool,
    max_states: usize,
    seen: &mut FxHashSet<StateKey>,
    states_explored: &mut usize,
    heap: &mut BinaryHeap<PrioritizedItem>,
) {
    if *states_explored >= max_states {
        return;
    }

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
    if !seen.insert(key) {
        return;
    }
    *states_explored += 1;
    let new_state = engine.get_state().clone();

    let node_idx = graph.index_of(&new_state.current_node_id).unwrap_or(0);
    let mut priority = if use_heuristic || !preconditions.requirements.is_empty() {
        preconditions.search_priority(&new_state, node_idx)
    } else {
        item.depth as u32 + 1
    };

    let progress_bonus = preconditions.choice_progress_bonus(choice, &item.state);
    priority = priority.saturating_sub(progress_bonus);

    if use_heuristic && dist.get(node_idx) == DIST_UNREACHABLE {
        return;
    }

    let new_words = count_words_in_view(&new_view);
    let new_path_tail = Some(Arc::new(PathNode {
        step: ChoiceTaken {
            node_id: node_id.to_string(),
            choice_id: choice_id.to_string(),
        },
        parent: item.path_tail.clone(),
    }));

    heap.push(PrioritizedItem {
        priority,
        depth: item.depth + 1,
        item: WorkItem {
            state: new_state,
            path_tail: new_path_tail,
            depth: item.depth + 1,
            word_count: item.word_count + new_words,
        },
    });
}

#[allow(clippy::too_many_arguments)]
fn try_enqueue_item_action(
    engine: &mut Engine,
    item: &WorkItem,
    action: &ItemActionView,
    graph: &GraphIndex,
    dist: &Distances,
    preconditions: &GoalPreconditions,
    abstraction: &ValueAbstraction,
    use_heuristic: bool,
    max_states: usize,
    seen: &mut FxHashSet<StateKey>,
    states_explored: &mut usize,
    heap: &mut BinaryHeap<PrioritizedItem>,
) {
    if *states_explored >= max_states {
        return;
    }

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

    let key = StateKey::from_state(engine.get_state(), None, abstraction);
    if !seen.insert(key) {
        return;
    }
    *states_explored += 1;
    let new_state = engine.get_state().clone();

    let node_idx = graph.index_of(&new_state.current_node_id).unwrap_or(0);
    let priority = if use_heuristic || !preconditions.requirements.is_empty() {
        preconditions.search_priority(&new_state, node_idx)
    } else {
        item.depth as u32 + 1
    };

    if use_heuristic && dist.get(node_idx) == DIST_UNREACHABLE {
        return;
    }

    let new_words = count_words_in_view(&new_view);
    let new_path_tail = Some(Arc::new(PathNode {
        step: ChoiceTaken {
            node_id: format!("{}@use:{}", item.state.current_node_id, action.item_ref),
            choice_id: action.action_id.clone(),
        },
        parent: item.path_tail.clone(),
    }));

    heap.push(PrioritizedItem {
        priority,
        depth: item.depth + 1,
        item: WorkItem {
            state: new_state,
            path_tail: new_path_tail,
            depth: item.depth + 1,
            word_count: item.word_count + new_words,
        },
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
