//! Death-path coverage search.
//!
//! Game-over nodes are never the target of a `goto`; the engine navigates to
//! them when the player's HP reaches 0 (redirecting to the chapter's
//! `death_node_id`, or the scenario default). The static choice graph therefore
//! has no edge into them, so the node-coverage search in [`super`] skips them.
//!
//! This search reaches a given game-over node dynamically: a best-first walk
//! that first routes into the region of the map whose deaths redirect there,
//! then minimises HP — exploring damaging choices and failed/exhausted skill
//! checks — until the engine performs the vitals redirect onto the target. If
//! no damage path exists in that region the budget is exhausted and the node is
//! reported as genuinely unreachable, which is the correct answer.

use std::cmp::Ordering;
use std::collections::BinaryHeap;

use blackbox::command::PlayerCommand;
use blackbox::view::CheckPreview;
use blackbox::{Engine, GameState, SkillCheckOverride};
use rustc_hash::FxHashSet;

use crate::sim::abstraction::ValueAbstraction;
use crate::sim::graph::{DIST_UNREACHABLE, Distances, GraphIndex};
use crate::sim::work::{StateKey, WorkItem};

const MAX_DEPTH: usize = 500;

/// Owning-region distance and target node id for a death search.
pub struct DeathTarget<'a> {
    pub node_id: &'a str,
    /// Forward progression distance from each node to the nearest node whose
    /// chapter redirects deaths to `node_id` (see
    /// [`GraphIndex::distances_to_any_progression`]).
    pub region_dist: &'a Distances,
}

/// Outcome of a death search: whether the target was reached, plus every
/// `(node_id, visible_choice_ids)` view visited (recorded in-flight so coverage
/// is faithful — replaying the witness would diverge at forced skill checks).
pub struct DeathSearchOutcome {
    pub reached: bool,
    pub visited_views: Vec<(String, Vec<String>)>,
}

struct PrioritizedItem {
    priority: u64,
    item: WorkItem,
}

impl Ord for PrioritizedItem {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reversed: BinaryHeap is a max-heap, we want the smallest priority first.
        other.priority.cmp(&self.priority)
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
        self.priority == other.priority
    }
}

pub fn run_death_search(
    engine: &mut Engine,
    initial_state: &GameState,
    graph: &GraphIndex,
    abstraction: &ValueAbstraction,
    target: &DeathTarget<'_>,
    budget: usize,
) -> DeathSearchOutcome {
    let mut visited_views: Vec<(String, Vec<String>)> = Vec::new();

    let initial_state = initial_state.clone();
    let start_idx = graph.index_of(&initial_state.current_node_id).unwrap_or(0);

    // The shared value abstraction drops `hp` from the key whenever no gate reads
    // it (the usual case — HP only appears in damage effects and text). That is
    // correct for normal dedup but fatal here: every HP value would collapse to
    // one state and the search could never descend toward 0. So we dedup on the
    // abstracted key *paired with raw HP*.
    let mut seen: FxHashSet<(StateKey, i32)> = FxHashSet::default();
    seen.insert((
        StateKey::from_state(&initial_state, None, abstraction),
        hp_of(&initial_state),
    ));

    let mut heap = BinaryHeap::new();
    heap.push(PrioritizedItem {
        priority: priority(&initial_state, start_idx, target.region_dist),
        item: WorkItem {
            state: initial_state,
            path_tail: None,
            depth: 0,
            word_count: 0,
        },
    });

    let mut states = 1usize;
    let mut reached = false;
    while let Some(PrioritizedItem { item, .. }) = heap.pop() {
        if reached || states > budget {
            break;
        }
        let view = match engine.restore_state(item.state.clone()) {
            Ok(v) => v,
            Err(_) => continue,
        };
        visited_views.push((
            view.node_id.clone(),
            view.choices.iter().map(|c| c.id.clone()).collect(),
        ));

        // The vitals redirect lands us directly on the target game-over node.
        if view.node_id == target.node_id {
            reached = true;
            continue;
        }
        if view.mode.is_terminal() || item.depth >= MAX_DEPTH {
            continue;
        }

        for choice_view in view.choices.iter().filter(|c| c.enabled) {
            let overrides = match &choice_view.check {
                Some(check) => skill_check_overrides(check),
                None => vec![],
            };
            if overrides.is_empty() {
                enqueue(
                    engine,
                    &item,
                    choice_view.id.as_str(),
                    None,
                    graph,
                    abstraction,
                    target,
                    &mut seen,
                    &mut states,
                    budget,
                    &mut heap,
                );
            } else {
                for override_outcome in overrides {
                    enqueue(
                        engine,
                        &item,
                        choice_view.id.as_str(),
                        Some(override_outcome),
                        graph,
                        abstraction,
                        target,
                        &mut seen,
                        &mut states,
                        budget,
                        &mut heap,
                    );
                }
            }
        }
    }

    DeathSearchOutcome {
        reached,
        visited_views,
    }
}

#[allow(clippy::too_many_arguments)]
fn enqueue(
    engine: &mut Engine,
    item: &WorkItem,
    choice_id: &str,
    check_override: Option<SkillCheckOverride>,
    graph: &GraphIndex,
    abstraction: &ValueAbstraction,
    target: &DeathTarget<'_>,
    seen: &mut FxHashSet<(StateKey, i32)>,
    states: &mut usize,
    budget: usize,
    heap: &mut BinaryHeap<PrioritizedItem>,
) {
    if *states >= budget {
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
    let key = StateKey::from_state(engine.get_state(), check_override, abstraction);
    if !seen.insert((key, hp_of(engine.get_state()))) {
        return;
    }
    *states += 1;
    let new_state = engine.get_state().clone();

    let node_idx = graph.index_of(&new_state.current_node_id).unwrap_or(0);
    heap.push(PrioritizedItem {
        priority: priority(&new_state, node_idx, target.region_dist),
        item: WorkItem {
            state: new_state,
            path_tail: None,
            depth: item.depth + 1,
            word_count: 0,
        },
    });
}

/// Lower is better. Pack the region distance into the high bits and HP into the
/// low bits: the search first navigates into the target's death region, then —
/// once there (region distance 0) — greedily minimises HP to trigger the vitals
/// redirect. Nodes that cannot reach the region at all sort last.
fn priority(state: &GameState, node_idx: u32, region_dist: &Distances) -> u64 {
    let region = region_dist.get(node_idx);
    let region_term = if region == DIST_UNREACHABLE {
        u32::MAX as u64
    } else {
        region as u64
    };
    let hp = hp_of(state).max(0) as u64;
    (region_term << 20) | hp.min((1 << 20) - 1)
}

fn hp_of(state: &GameState) -> i32 {
    state.player.stats.get("hp").copied().unwrap_or(0)
}

/// Force each skill-check outcome — failure/exhausted are the damage sources
/// that drive HP toward 0, so they come first. `ForceExhausted` is only valid
/// when the check has a bounded attempt count.
fn skill_check_overrides(check: &CheckPreview) -> Vec<SkillCheckOverride> {
    let mut overrides = vec![SkillCheckOverride::ForceFailure];
    if check.max_attempts.is_some() {
        overrides.push(SkillCheckOverride::ForceExhausted);
    }
    overrides.push(SkillCheckOverride::ForceSuccess);
    overrides
}
