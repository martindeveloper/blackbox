use std::hash::{Hash, Hasher};
use std::sync::Arc;

use rustc_hash::FxHasher;

use blackbox::{DynamicValue, GameState, SkillCheckOverride};

use super::abstraction::{Abstracted, ValueAbstraction};

#[derive(Debug, Clone)]
pub struct ChoiceTaken {
    pub node_id: String,
    pub choice_id: String,
}

/// Node in a persistent singly-linked path list.
///
/// Each `WorkItem` holds a tail pointer; extending a path is one `Arc::new`
/// plus one atomic refcount increment instead of cloning the entire `Vec`.
/// Shared prefixes (all branches from the same parent state) cost nothing extra
/// to store.
pub struct PathNode {
    pub step: ChoiceTaken,
    pub parent: Option<Arc<PathNode>>,
}

#[derive(Clone)]
pub struct WorkItem {
    pub state: GameState,
    /// Tail of the persistent choice path.  `None` at the start state.
    pub path_tail: Option<Arc<PathNode>>,
    pub depth: usize,
    pub word_count: u32,
}

/// Deduplication key: hash of the fields that determine future game behaviour.
/// `events` and `visited_nodes` are excluded (always growing, would make every
/// state unique). `random_counter` is excluded to avoid exponential state
/// explosion — same node+stats+flags reached via different paths is treated as
/// the same state, which is correct for coverage analysis.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct StateKey(u64);

impl StateKey {
    /// Shard index for lock-striped dedup sets. `shards` must be a power of two.
    pub fn shard(&self, shards: usize) -> usize {
        debug_assert!(shards.is_power_of_two());
        (self.0 as usize) & (shards - 1)
    }
}

impl StateKey {
    /// Build the dedup key, folding numeric stats and relationship metrics
    /// through `abstraction` so that values which gate behaviour identically are
    /// treated as the same state (see [`super::abstraction`]). Discrete fields
    /// (flags, items, choice attempts) are always hashed exactly.
    pub fn from_state(
        state: &GameState,
        branch_key: Option<SkillCheckOverride>,
        abstraction: &ValueAbstraction,
    ) -> Self {
        let mut h = FxHasher::default();

        state.current_node_id.hash(&mut h);

        // Stats: hash each through the abstraction.  `Drop` dimensions (never read
        // by a gate) are omitted entirely; bucketed/exact dimensions contribute a
        // tagged hash.  Commutative sum so HashMap iteration order is irrelevant.
        let stat_sum: u64 = state
            .player
            .stats
            .iter()
            .filter_map(|(name, &value)| hash_abstracted(name, abstraction.stat(name, value)))
            .fold(0u64, u64::wrapping_add);
        stat_sum.hash(&mut h);

        hash_map_commutative(&state.inventory.items, &mut h);

        // DynamicValue doesn't impl Hash, so we hash variants inline — no format!.
        // Write-only flags (never read by any gate) are dropped: they cannot
        // affect future behaviour, and keeping them would split otherwise
        // identical states for every combination of narrative markers.
        let flags_sum: u64 = state
            .flags
            .iter()
            .filter(|(k, _)| abstraction.flag_is_read(k))
            .map(|(k, v)| {
                let mut hh = FxHasher::default();
                k.hash(&mut hh);
                hash_dyn_value(v, &mut hh);
                hh.finish()
            })
            .fold(0u64, u64::wrapping_add);
        flags_sum.hash(&mut h);

        hash_map_commutative(&state.choice_attempts, &mut h);

        // Relationship scores gate content (e.g. relationshipGte); folded through
        // the abstraction so loop-driven increments past the last gated threshold
        // collapse to one state instead of exploding the search frontier.
        let rel_sum: u64 = state
            .relationships
            .iter()
            .map(|(char_id, scores)| {
                let metric_sum: u64 = scores
                    .0
                    .iter()
                    .filter_map(|(metric, &value)| {
                        hash_abstracted(metric, abstraction.rel(char_id, metric, value))
                    })
                    .fold(0u64, u64::wrapping_add);
                let mut hh = FxHasher::default();
                char_id.hash(&mut hh);
                metric_sum.hash(&mut hh);
                hh.finish()
            })
            .fold(0u64, u64::wrapping_add);
        rel_sum.hash(&mut h);

        if let Some(branch) = branch_key {
            branch.hash(&mut h);
        }

        Self(h.finish())
    }
}

/// Hash one abstracted numeric dimension, or `None` when it should be dropped.
/// The variant tag keeps a bucket code from colliding with an equal raw value.
#[inline]
fn hash_abstracted(name: &str, abstracted: Abstracted) -> Option<u64> {
    let mut h = FxHasher::default();
    name.hash(&mut h);
    match abstracted {
        Abstracted::Drop => return None,
        Abstracted::Bucket(code) => {
            0u8.hash(&mut h);
            code.hash(&mut h);
        }
        Abstracted::Exact(value) => {
            1u8.hash(&mut h);
            value.hash(&mut h);
        }
    }
    Some(h.finish())
}

#[inline]
fn hash_map_commutative<K: Hash, V: Hash, S>(
    map: &std::collections::HashMap<K, V, S>,
    outer: &mut impl Hasher,
) {
    let sum: u64 = map
        .iter()
        .map(|(k, v)| {
            let mut h = FxHasher::default();
            k.hash(&mut h);
            v.hash(&mut h);
            h.finish()
        })
        .fold(0u64, u64::wrapping_add);
    sum.hash(outer);
}

#[inline]
fn hash_dyn_value(v: &DynamicValue, h: &mut impl Hasher) {
    match v {
        DynamicValue::Bool(b) => {
            0u8.hash(h);
            b.hash(h);
        }
        DynamicValue::Number(n) => {
            1u8.hash(h);
            n.hash(h);
        }
        DynamicValue::String(s) => {
            2u8.hash(h);
            s.hash(h);
        }
    }
}

impl WorkItem {
    pub fn path_hint(&self) -> String {
        let mut steps: Vec<String> = Vec::new();
        let mut cur = &self.path_tail;
        while let Some(node) = cur {
            steps.push(format!("{}:{}", node.step.node_id, node.step.choice_id));
            cur = &node.parent;
        }
        steps.reverse();

        if steps.is_empty() {
            return "(start)".to_string();
        }
        if steps.len() <= 5 {
            steps.join(" → ")
        } else {
            format!(
                "{} → ... → {}",
                steps[..3].join(" → "),
                steps[steps.len() - 1]
            )
        }
    }
}
