//! Static precondition extraction and runtime satisfaction checks for goal search.

use std::collections::HashSet;

use rustc_hash::FxHashSet;

use blackbox::content::{ChoiceContent, Effect, GameContent, NodeContent};
use blackbox::{Condition, DynamicValue, GameState, Gate};

use super::graph::{
    Distances, GraphIndex, Slice, choice_branch_targets_for, is_non_progression_action,
};

const ACTOR_FLAG_PREFIX: &str = "_actor_";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Precondition {
    Flag {
        flag: String,
        value: DynamicValue,
    },
    Item {
        item_id: String,
        count: u32,
    },
    Actor {
        character_id: String,
    },
    StatGte {
        stat: String,
        value: i32,
    },
    StatLte {
        stat: String,
        value: i32,
    },
    StatEq {
        stat: String,
        value: i32,
    },
    RelationshipGte {
        character_id: String,
        metric: String,
        value: i32,
    },
    RelationshipLte {
        character_id: String,
        metric: String,
        value: i32,
    },
    RelationshipEq {
        character_id: String,
        metric: String,
        value: i32,
    },
    /// At least one alternative must hold. Extracted by [`cut_landmarks`] from
    /// gates where no single leaf is necessary but the disjunction as a whole is.
    AnyOf {
        alternatives: Vec<Precondition>,
    },
    /// Every part must hold. Appears as an alternative of an [`Precondition::AnyOf`],
    /// carrying the conjunctive gate of one route into the goal; a conjunction
    /// standing alone is always split into its parts instead.
    AllOf {
        parts: Vec<Precondition>,
    },
    /// The inner requirement must *not* hold — an `unless` on the way to the
    /// goal. These start satisfied and can only be broken, so they never guide
    /// the search forward; their job is to bury a state that locked itself out.
    Not(Box<Precondition>),
}

impl Precondition {
    pub fn label(&self) -> String {
        match self {
            Precondition::AnyOf { alternatives } => {
                let inner: Vec<String> = alternatives.iter().map(Precondition::label).collect();
                format!("any({})", inner.join("|"))
            }
            Precondition::AllOf { parts } => {
                let inner: Vec<String> = parts.iter().map(Precondition::label).collect();
                format!("all({})", inner.join("&"))
            }
            Precondition::Not(inner) => format!("not({})", inner.label()),
            Precondition::Flag { flag, value } => format!("flag:{flag}={value}"),
            Precondition::Item { item_id, count } => format!("item:{item_id}×{count}"),
            Precondition::Actor { character_id } => format!("actor:{character_id}"),
            Precondition::StatGte { stat, value } => format!("stat:{stat}≥{value}"),
            Precondition::StatLte { stat, value } => format!("stat:{stat}≤{value}"),
            Precondition::StatEq { stat, value } => format!("stat:{stat}={value}"),
            Precondition::RelationshipGte {
                character_id,
                metric,
                value,
            } => {
                format!("rel:{character_id}.{metric}≥{value}")
            }
            Precondition::RelationshipLte {
                character_id,
                metric,
                value,
            } => {
                format!("rel:{character_id}.{metric}≤{value}")
            }
            Precondition::RelationshipEq {
                character_id,
                metric,
                value,
            } => {
                format!("rel:{character_id}.{metric}={value}")
            }
        }
    }

    /// Human-facing form of [`Precondition::label`]. A wide disjunction is
    /// elided so reports stay readable; `label` remains the identity key.
    pub fn summary(&self) -> String {
        const SHOWN: usize = 3;
        let (children, open, sep, close) = match self {
            Precondition::AnyOf { alternatives } => (alternatives, "any(", "|", ")"),
            Precondition::AllOf { parts } => (parts, "all(", "&", ")"),
            Precondition::Not(inner) => return format!("not({})", inner.summary()),
            _ => return self.label(),
        };
        let shown: Vec<String> = children
            .iter()
            .take(SHOWN)
            .map(Precondition::summary)
            .collect();
        let elision = match children.len().saturating_sub(SHOWN) {
            0 => String::new(),
            n => format!("{sep}…+{n}"),
        };
        format!("{open}{}{elision}{close}", shown.join(sep))
    }

    /// Whether meeting this requires going and doing something, as opposed to
    /// merely refraining. A disjunction only counts when every alternative does.
    fn demands_action(&self) -> bool {
        match self {
            Precondition::Not(_) => false,
            Precondition::AllOf { parts } => parts.iter().any(Precondition::demands_action),
            Precondition::AnyOf { alternatives } => {
                alternatives.iter().all(Precondition::demands_action)
            }
            _ => true,
        }
    }

    /// The children of a compound requirement, or `None` for a leaf.
    fn children(&self) -> Option<&[Precondition]> {
        match self {
            Precondition::AnyOf {
                alternatives: children,
            }
            | Precondition::AllOf { parts: children } => Some(children),
            _ => None,
        }
    }

    pub fn is_satisfied(&self, state: &GameState) -> bool {
        match self {
            Precondition::AnyOf { alternatives } => {
                alternatives.iter().any(|alt| alt.is_satisfied(state))
            }
            Precondition::AllOf { parts } => parts.iter().all(|part| part.is_satisfied(state)),
            Precondition::Not(inner) => !inner.is_satisfied(state),
            Precondition::Flag { flag, value } => flag_matches(state, flag, value),
            Precondition::Item { item_id, count } => {
                state.inventory.items.get(item_id).copied().unwrap_or(0) >= *count
            }
            Precondition::Actor { character_id } => flag_matches(
                state,
                &format!("{ACTOR_FLAG_PREFIX}{character_id}"),
                &DynamicValue::Bool(true),
            ),
            Precondition::StatGte { stat, value } => {
                state.player.stats.get(stat).copied().unwrap_or(0) >= *value
            }
            Precondition::StatLte { stat, value } => {
                state.player.stats.get(stat).copied().unwrap_or(0) <= *value
            }
            Precondition::StatEq { stat, value } => {
                state.player.stats.get(stat).copied().unwrap_or(0) == *value
            }
            Precondition::RelationshipGte {
                character_id,
                metric,
                value,
            } => rel_score(state, character_id, metric) >= *value,
            Precondition::RelationshipLte {
                character_id,
                metric,
                value,
            } => rel_score(state, character_id, metric) <= *value,
            Precondition::RelationshipEq {
                character_id,
                metric,
                value,
            } => rel_score(state, character_id, metric) == *value,
        }
    }
}

#[derive(Debug, Clone)]
pub struct GoalPreconditions {
    pub requirements: Vec<Precondition>,
    /// Per-requirement "acquire distance" field, parallel to `requirements`.
    /// `Some(d)` when the requirement's granting nodes were located: `d[node]`
    /// is the shortest progression path from `node` through a granting node to
    /// the goal. A stat/relationship requirement counts every node that moves
    /// the value in the required direction as granting, so a threshold reached
    /// over several steps still yields a gradient. `None` when no setter exists.
    pub acquire: Vec<Option<super::graph::Distances>>,
    /// Per-requirement mask of nodes that may not count as acquisition sites,
    /// parallel to `requirements`. Set for cut landmarks: a setter inside the
    /// zone the landmark cuts off is only reachable *after* the landmark holds,
    /// so counting it would let the search believe it can pick the requirement
    /// up on the far side of the very gate that demands it — and then race at
    /// the goal with the gate still shut. `None` means every setter counts.
    blocked_setters: Vec<Option<Vec<bool>>>,
    /// Progression-only distances to the goal, computed as a by-product of extraction.
    /// Reused as the goal-search heuristic so the search is guided by real progression
    /// distances rather than all-edge distances that include restart/menu shortcuts.
    pub progression_distances: super::graph::Distances,
}

impl Default for GoalPreconditions {
    fn default() -> Self {
        Self {
            requirements: Vec::new(),
            acquire: Vec::new(),
            blocked_setters: Vec::new(),
            progression_distances: super::graph::Distances::unreachable(),
        }
    }
}

/// Cap on transitively collected requirements — bounds extraction work and
/// keeps the missing-precondition report readable on pathological content.
const MAX_TRANSITIVE_REQUIREMENTS: usize = 48;

/// How many times [`cut_landmarks`] peels a cut off the goal zone. Each round
/// yields the requirements guarding the routes into the previous round's zone.
const MAX_CUT_ROUNDS: usize = 4;
/// How far [`RouteAnalysis`] recurses upstream from a cut choice, and how many
/// cut analyses one goal may run. Together they bound work that is otherwise
/// exponential in the branching of the cut.
const MAX_ROUTE_DEPTH: usize = 2;
const MAX_ROUTE_ANALYSES: usize = 64;
/// Cap on how many children one requirement node may hold, so a pathological
/// gate cannot produce a landmark too wide to evaluate or to report.
const MAX_DISJUNCTION_WIDTH: usize = 32;

impl GoalPreconditions {
    /// Landmark-style extraction: a condition is a requirement only if it is
    /// *necessary* — deleting every choice gated on it disconnects the start
    /// from the goal. This is immune to alternative branches: a condition that
    /// only guards one of several routes (e.g. an item one sibling choice
    /// consumes and another does without) never becomes a requirement, so the
    /// search is never penalised for legitimately bypassing it.
    ///
    /// Necessity is closed transitively: satisfying a flag/item/actor
    /// requirement means reaching one of its setter nodes, and the path to
    /// those setters may itself be locked behind earlier conditions (an ending
    /// gated on a consent flag whose setter sits behind a multi-flag chapter
    /// gate). Each newly necessary condition is therefore also tested as a
    /// target, until a fixpoint.
    pub fn extract(
        content: &GameContent,
        graph: &GraphIndex,
        goal_id: &str,
        slice: &Slice,
    ) -> Self {
        let dist = graph.distances_to_progression(goal_id);

        let candidates = collect_candidates(content, graph, slice);
        let goal_targets: Vec<u32> = graph.index_of(goal_id).into_iter().collect();

        let mut requirements: Vec<Precondition> = Vec::new();
        let mut accepted: HashSet<String> = HashSet::new();
        let mut queue: std::collections::VecDeque<Precondition> = std::collections::VecDeque::new();

        for cand in &candidates {
            if requirements.len() >= MAX_TRANSITIVE_REQUIREMENTS {
                break;
            }
            if necessary_for(content, graph, &goal_targets, cand) && accepted.insert(cand.label()) {
                requirements.push(cand.clone());
                queue.push_back(cand.clone());
            }
        }

        while let Some(req) = queue.pop_front() {
            if requirements.len() >= MAX_TRANSITIVE_REQUIREMENTS {
                break;
            }
            if setter_indices(content, graph, &req).is_empty() {
                continue;
            }
            for cand in &candidates {
                if accepted.contains(&cand.label()) {
                    continue;
                }
                // A setter is only usable under "no `cand`" if it still has a
                // granting route not gated on `cand` — the gate may sit on the
                // granting choice itself rather than on the path to the node.
                let usable_setters: Vec<u32> = content
                    .nodes
                    .iter()
                    .filter(|(_, node)| node_grants_without(node, &req, cand))
                    .filter_map(|(id, _)| graph.index_of(id))
                    .collect();
                if usable_setters.is_empty() || necessary_for(content, graph, &usable_setters, cand)
                {
                    accepted.insert(cand.label());
                    requirements.push(cand.clone());
                    queue.push_back(cand.clone());
                    if requirements.len() >= MAX_TRANSITIVE_REQUIREMENTS {
                        break;
                    }
                }
            }
        }

        let mut blocked_setters: Vec<Option<Vec<bool>>> = vec![None; requirements.len()];

        // Disjunctive landmarks catch what the single-condition necessity test
        // cannot: a goal whose every route is gated on an `Any(...)`, or on two
        // different gates one per route. No individual leaf is then necessary,
        // so the loops above find nothing and the search gets no guidance at all.
        for landmark in cut_landmarks(content, graph, goal_id, slice) {
            if requirements.len() >= MAX_TRANSITIVE_REQUIREMENTS {
                break;
            }
            if accepted.insert(landmark.requirement.label()) {
                requirements.push(landmark.requirement);
                blocked_setters.push(Some(landmark.zone));
            }
        }

        let acquire = build_acquire_fields(content, graph, &requirements, &blocked_setters, &dist);
        Self {
            requirements,
            acquire,
            blocked_setters,
            progression_distances: dist,
        }
    }

    /// Append extra requirements (e.g. a choice's visibility `when` conditions)
    /// and recompute the acquire fields so the search is guided to satisfy them
    /// too. Used by choice-coverage completion to reach a node in a state where a
    /// conditionally-visible choice actually appears.
    pub fn with_extra_requirements(
        mut self,
        content: &GameContent,
        graph: &GraphIndex,
        extras: Vec<Precondition>,
    ) -> Self {
        for extra in extras {
            if !self.requirements.contains(&extra) {
                self.requirements.push(extra);
                self.blocked_setters.push(None);
            }
        }
        self.acquire = build_acquire_fields(
            content,
            graph,
            &self.requirements,
            &self.blocked_setters,
            &self.progression_distances,
        );
        self
    }

    pub fn satisfied_count(&self, state: &GameState) -> usize {
        self.requirements
            .iter()
            .filter(|p| p.is_satisfied(state))
            .count()
    }

    pub fn missing_labels(&self, state: &GameState) -> Vec<String> {
        self.requirements
            .iter()
            .filter(|p| !p.is_satisfied(state))
            .map(Precondition::summary)
            .collect()
    }

    pub fn choice_progress_bonus(&self, choice: &ChoiceContent, state: &GameState) -> u32 {
        let effects = choice_effects(choice);
        let mut bonus = 0u32;
        for req in &self.requirements {
            if req.is_satisfied(state) {
                continue;
            }
            for effect in &effects {
                bonus = bonus.saturating_add(effect_bonus(effect, req, state));
            }
        }
        bonus
    }

    pub fn gateway_snapshot(&self, state: &GameState) -> Vec<(String, String)> {
        self.requirements
            .iter()
            .map(|p| {
                let status = if p.is_satisfied(state) { "✓" } else { "✗" };
                (p.summary(), status.to_string())
            })
            .collect()
    }

    /// Lower is better. Combines a distance estimate with the count of unmet
    /// requirements. The base distance is the plain progression distance to the
    /// goal; each unmet flag/item/actor requirement adds the *extra detour* its
    /// nearest granting node would cost from here (`acquire` field minus the
    /// base). Summing the detours — rather than taking the longest one — means
    /// satisfying any requirement strictly lowers the priority, so the search
    /// keeps a gradient across states that differ only in which side-quests are
    /// done, instead of plateauing until the single farthest one is resolved.
    /// A requirement that is no longer acquirable from this node saturates the
    /// distance, burying states that have locked themselves out.
    pub fn search_priority(&self, state: &GameState, node_idx: u32) -> u32 {
        let base = self.progression_distances.get(node_idx);
        let mut dist = base;
        let mut missing = 0u32;
        for (i, req) in self.requirements.iter().enumerate() {
            if req.is_satisfied(state) {
                continue;
            }
            missing += 1;
            if let Some(Some(acquire)) = self.acquire.get(i) {
                let through = acquire.get(node_idx);
                if through == super::graph::DIST_UNREACHABLE {
                    dist = super::graph::DIST_UNREACHABLE;
                } else {
                    dist = dist.saturating_add(through.saturating_sub(base));
                }
            }
        }
        dist.saturating_mul(100)
            .saturating_add(missing.saturating_mul(80))
    }
}

#[inline]
fn rel_score(state: &GameState, character_id: &str, metric: &str) -> i32 {
    state
        .relationships
        .get(character_id)
        .map_or(0, |s| s.get(metric))
}

fn flag_matches(state: &GameState, flag: &str, expected: &DynamicValue) -> bool {
    match state.flags.get(flag) {
        Some(actual) => actual == expected,
        None => matches!(
            expected,
            DynamicValue::Bool(false) | DynamicValue::Number(0)
        ),
    }
}

/// All distinct conjunctive gate conditions on progression choices inside the
/// goal's backward slice — the candidate pool for the necessity test. Sorted by
/// label so extraction is deterministic regardless of node-map iteration order.
fn collect_candidates(
    content: &GameContent,
    graph: &GraphIndex,
    slice: &Slice,
) -> Vec<Precondition> {
    let mut out = Vec::new();
    for (node_id, node) in &content.nodes {
        if !slice.contains_id(graph, node_id) {
            continue;
        }
        for choice in &node.choices {
            if is_non_progression_action(&choice.resolution.action) {
                continue;
            }
            collect_from_choice_gate(choice, &mut out);
        }
    }
    dedupe_preconditions(&mut out);
    out.sort_by_key(Precondition::label);
    out
}

/// True when `cand` is necessary to reach any node in `targets` from the game
/// start: a BFS over progression choices that skips every choice whose
/// (conjunctive) gate demands `cand` fails to reach all of them. Choices merely
/// *able* to be taken without `cand` (`Any`/`Not` gates, ungated siblings) keep
/// their edges, so conditions guarding only one of several routes are never
/// reported necessary.
fn necessary_for(
    content: &GameContent,
    graph: &GraphIndex,
    targets: &[u32],
    cand: &Precondition,
) -> bool {
    if targets.is_empty() {
        return false;
    }
    let Some(start_idx) = graph.index_of(&content.start_node_id) else {
        return false;
    };
    let cand_label = cand.label();
    let target_set: FxHashSet<u32> = targets.iter().copied().collect();
    if target_set.contains(&start_idx) {
        return false;
    }

    let mut visited = vec![false; graph.len()];
    visited[start_idx as usize] = true;
    let mut queue = std::collections::VecDeque::from([start_idx]);
    let mut scratch = Vec::new();

    while let Some(idx) = queue.pop_front() {
        let node_id = graph.id_of(idx);
        let Some(node) = content.nodes.get(node_id) else {
            continue;
        };
        for choice in &node.choices {
            if is_non_progression_action(&choice.resolution.action) {
                continue;
            }
            scratch.clear();
            collect_from_choice_gate(choice, &mut scratch);
            if scratch.iter().any(|p| p.label() == cand_label) {
                continue; // gated on the candidate — deleted for this test
            }
            for target in choice_branch_targets_for(content, choice, node_id) {
                let Some(t) = graph.index_of(&target) else {
                    continue;
                };
                if visited[t as usize] {
                    continue;
                }
                if target_set.contains(&t) {
                    return false; // reachable without cand — not necessary
                }
                visited[t as usize] = true;
                queue.push_back(t);
            }
        }
    }

    true
}

/// Node indices that grant `req` (on enter or via any choice effect).
fn setter_indices(content: &GameContent, graph: &GraphIndex, req: &Precondition) -> Vec<u32> {
    content
        .nodes
        .iter()
        .filter(|(_, node)| node_grants(node, req))
        .filter_map(|(id, _)| graph.index_of(id))
        .collect()
}

fn collect_from_choice_gate(choice: &ChoiceContent, out: &mut Vec<Precondition>) {
    if let Some(gate) = &choice.gate.requires {
        collect_from_gate(gate, out);
    }
    if let Some(gate) = &choice.gate.when {
        collect_from_gate(gate, out);
    }
}

/// Extract the satisfiable preconditions implied by a gate (e.g. a choice's
/// `when` visibility gate). Only the conjunctive (`All` / leaf) structure yields
/// requirements; `Any` / `Not` branches contribute nothing (we cannot guarantee
/// which disjunct to satisfy), which is sound — they just give no extra guidance.
pub fn preconditions_from_gate(gate: &Gate) -> Vec<Precondition> {
    let mut out = Vec::new();
    collect_from_gate(gate, &mut out);
    dedupe_preconditions(&mut out);
    out
}

fn collect_from_gate(gate: &Gate, out: &mut Vec<Precondition>) {
    match gate {
        Gate::All(children) => {
            for child in children {
                collect_from_gate(child, out);
            }
        }
        Gate::Condition(condition) => {
            if let Some(pre) = condition_to_precondition(condition) {
                out.push(pre);
            }
        }
        Gate::Any(_) | Gate::Not(_) => {}
    }
}

fn condition_to_precondition(condition: &Condition) -> Option<Precondition> {
    match condition {
        Condition::HasFlag { flag, value, .. } => Some(Precondition::Flag {
            flag: flag.clone(),
            value: value.clone().unwrap_or(DynamicValue::Bool(true)),
        }),
        Condition::HasItem { item_id, count, .. } => Some(Precondition::Item {
            item_id: item_id.clone(),
            count: *count,
        }),
        Condition::ActorPresent { character_id, .. } => Some(Precondition::Actor {
            character_id: character_id.clone(),
        }),
        Condition::StatGte { stat, value, .. } => Some(Precondition::StatGte {
            stat: stat.clone(),
            value: *value,
        }),
        Condition::StatLte { stat, value, .. } => Some(Precondition::StatLte {
            stat: stat.clone(),
            value: *value,
        }),
        Condition::StatEq { stat, value, .. } => Some(Precondition::StatEq {
            stat: stat.clone(),
            value: *value,
        }),
        Condition::RelationshipGte {
            character_id,
            metric,
            value,
            ..
        } => Some(Precondition::RelationshipGte {
            character_id: character_id.clone(),
            metric: metric.clone(),
            value: *value,
        }),
        Condition::RelationshipLte {
            character_id,
            metric,
            value,
            ..
        } => Some(Precondition::RelationshipLte {
            character_id: character_id.clone(),
            metric: metric.clone(),
            value: *value,
        }),
        Condition::RelationshipEq {
            character_id,
            metric,
            value,
            ..
        } => Some(Precondition::RelationshipEq {
            character_id: character_id.clone(),
            metric: metric.clone(),
            value: *value,
        }),
        Condition::Visited { .. } | Condition::AtNode { .. } => None,
    }
}

fn dedupe_preconditions(requirements: &mut Vec<Precondition>) {
    let mut seen = HashSet::new();
    requirements.retain(|p| seen.insert(p.label()));
}

/// A choice, addressed by its owning node index and its position in `node.choices`.
type ChoiceRef = (u32, usize);

/// Disjunctive landmarks, found by repeatedly cutting the goal's *open zone*.
///
/// The open zone is the set of nodes that can reach the goal using only choices
/// whose gate demands nothing (ungated, or gated purely on `unless`/`Not`).
/// If the start is outside that zone, every playthrough must cross into it, and
/// it can only do so over a gated choice whose source is outside and whose
/// target is inside. Those crossing choices form a *cut*: at least one of their
/// gates must hold, so picking one disjunct-set per cut choice and taking the
/// union yields a set of conditions of which at least one is guaranteed to be
/// satisfied on any path to the goal — a sound disjunctive landmark.
///
/// This finds what [`necessary_for`] structurally cannot: a goal whose only
/// routes are gated on `Any(...)`, or gated differently per route, has no single
/// necessary condition, so the leaf-at-a-time necessity test reports nothing and
/// the search runs blind. Each round then assumes the cut satisfied and repeats,
/// peeling off the requirements that guard the way to the previous cut.
struct CutLandmark {
    requirement: Precondition,
    /// The open zone this landmark guards the way into (see `blocked_setters`).
    zone: Vec<bool>,
}

fn cut_landmarks(
    content: &GameContent,
    graph: &GraphIndex,
    goal_id: &str,
    slice: &Slice,
) -> Vec<CutLandmark> {
    let (Some(goal_idx), Some(start_idx)) = (
        graph.index_of(goal_id),
        graph.index_of(&content.start_node_id),
    ) else {
        return Vec::new();
    };

    let mut assumed: FxHashSet<ChoiceRef> = FxHashSet::default();
    let mut out: Vec<CutLandmark> = Vec::new();
    let mut seen = HashSet::new();
    let mut routes = RouteAnalysis::new(content, graph, start_idx);

    for _ in 0..MAX_CUT_ROUNDS {
        let zone = open_zone(content, graph, goal_idx, &assumed);
        if zone[start_idx as usize] {
            break; // goal already openly reachable — nothing left to require
        }

        let cut = cut_choices(content, graph, slice, &zone, &assumed);
        if cut.is_empty() {
            break; // no way in at all; static unreachability is reported elsewhere
        }

        // The path takes exactly one cut choice, so its gate is what must hold —
        // but which one is unknown, hence the disjunction over the whole cut.
        if let Some(requirement) = routes.disjoin_cut(&cut, MAX_ROUTE_DEPTH) {
            // A single-route cut yields a conjunction; every conjunct is then
            // necessary in its own right, and separate requirements each get
            // their own acquire gradient instead of one all-or-nothing landmark.
            let parts = match requirement {
                Precondition::AllOf { parts } => parts,
                single => vec![single],
            };
            for part in parts {
                if seen.insert(part.label()) {
                    out.push(CutLandmark {
                        requirement: part,
                        zone: zone.clone(),
                    });
                }
            }
        }

        for (node_id, index) in cut {
            if let Some(idx) = graph.index_of(node_id) {
                assumed.insert((idx, index));
            }
        }
    }

    out
}

/// Turns a cut into a requirement, recursing upstream from each cut choice.
///
/// A cut choice's own gate is not the whole story: reaching the node that offers
/// it may itself be gated. Without that, a cut whose routes are individually
/// unreachable still looks satisfied — Lesser Blood's `ending_lesser_blood` has
/// a second route into the heir case whose gate one early flag opens, while the
/// node offering it sits behind a gate nothing required. The search then reads
/// the landmark as met and stops steering, so it never raises the relationship
/// the *first* route needs. Conjoining each route's gate with what it takes to
/// reach that route keeps both alive as genuine alternatives.
struct RouteAnalysis<'a> {
    content: &'a GameContent,
    graph: &'a GraphIndex,
    start_idx: u32,
    /// Targets on the current recursion stack; re-entering one would loop.
    in_progress: FxHashSet<u32>,
    budget: usize,
}

impl<'a> RouteAnalysis<'a> {
    fn new(content: &'a GameContent, graph: &'a GraphIndex, start_idx: u32) -> Self {
        Self {
            content,
            graph,
            start_idx,
            in_progress: FxHashSet::default(),
            budget: MAX_ROUTE_ANALYSES,
        }
    }

    /// "At least one cut choice is taken, and its route is walkable."
    fn disjoin_cut(&mut self, cut: &[(&str, usize)], depth: usize) -> Option<Precondition> {
        let branches: Option<Vec<Precondition>> = cut
            .iter()
            .map(|&(node_id, index)| {
                let gate = choice_requirement(&self.content.nodes[node_id].choices[index])?;
                let upstream = self
                    .graph
                    .index_of(node_id)
                    .and_then(|source| self.requirement_to_reach(source, depth));
                all_of(std::iter::once(gate).chain(upstream).collect())
            })
            .collect();
        branches.and_then(any_of)
    }

    /// What must hold to reach `target` from the start, or `None` when it is
    /// openly reachable, when the recursion bound is hit, or when no requirement
    /// could be derived.
    fn requirement_to_reach(&mut self, target: u32, depth: usize) -> Option<Precondition> {
        if depth == 0 || self.budget == 0 || !self.in_progress.insert(target) {
            return None;
        }
        self.budget -= 1;

        let no_assumptions = FxHashSet::default();
        let zone = open_zone(self.content, self.graph, target, &no_assumptions);
        let requirement = if zone[self.start_idx as usize] {
            None
        } else {
            let slice = self
                .graph
                .backward_slice_with_distances(self.graph.id_of(target))
                .0;
            let cut = cut_choices(self.content, self.graph, &slice, &zone, &no_assumptions);
            self.disjoin_cut(&cut, depth - 1)
        };

        self.in_progress.remove(&target);
        requirement
    }
}

/// Nodes that can reach `goal_idx` using only open choices — those whose gate
/// implies no requirement, plus the choices in `assumed`. Iterated to a fixpoint
/// over the whole node map; the graph is small and this runs once per goal.
fn open_zone(
    content: &GameContent,
    graph: &GraphIndex,
    goal_idx: u32,
    assumed: &FxHashSet<ChoiceRef>,
) -> Vec<bool> {
    let mut zone = vec![false; graph.len()];
    zone[goal_idx as usize] = true;

    let mut changed = true;
    while changed {
        changed = false;
        for (node_id, node) in &content.nodes {
            let Some(idx) = graph.index_of(node_id) else {
                continue;
            };
            if zone[idx as usize] {
                continue;
            }
            let opens_into_zone = node.choices.iter().enumerate().any(|(index, choice)| {
                choice_is_open(choice, (idx, index), assumed)
                    && reaches_zone(content, graph, node_id, choice, &zone)
            });
            if opens_into_zone {
                zone[idx as usize] = true;
                changed = true;
            }
        }
    }
    zone
}

/// Gated choices that cross into the zone from outside it: the cut. Sources are
/// restricted to the goal's backward slice because any path to the goal stays
/// inside it, which keeps unrelated side-branches out of the landmark.
fn cut_choices<'a>(
    content: &'a GameContent,
    graph: &GraphIndex,
    slice: &Slice,
    zone: &[bool],
    assumed: &FxHashSet<ChoiceRef>,
) -> Vec<(&'a str, usize)> {
    let mut cut = Vec::new();
    for (node_id, node) in &content.nodes {
        let Some(idx) = graph.index_of(node_id) else {
            continue;
        };
        if zone[idx as usize] || !slice.contains(idx) {
            continue;
        }
        for (index, choice) in node.choices.iter().enumerate() {
            if choice_is_open(choice, (idx, index), assumed) {
                continue;
            }
            if reaches_zone(content, graph, node_id, choice, zone) {
                cut.push((node_id.as_str(), index));
            }
        }
    }
    cut.sort_unstable();
    cut
}

fn reaches_zone(
    content: &GameContent,
    graph: &GraphIndex,
    node_id: &str,
    choice: &ChoiceContent,
    zone: &[bool],
) -> bool {
    if is_non_progression_action(&choice.resolution.action) {
        return false;
    }
    choice_branch_targets_for(content, choice, node_id)
        .iter()
        .filter_map(|target| graph.index_of(target))
        .any(|target| zone[target as usize])
}

/// A choice is open when nothing must be arranged in advance to take it, or when
/// an earlier cut round already assumed it. A purely negative gate ("as long as
/// you haven't…") is open: it is satisfied by default, so it never bars the way
/// in and must not create a spurious cut.
fn choice_is_open(
    choice: &ChoiceContent,
    choice_ref: ChoiceRef,
    assumed: &FxHashSet<ChoiceRef>,
) -> bool {
    assumed.contains(&choice_ref)
        || !choice_requirement(choice).is_some_and(|req| req.demands_action())
}

/// What must hold for a choice to be takeable. `requires` and `when` must both
/// hold, so they conjoin.
fn choice_requirement(choice: &ChoiceContent) -> Option<Precondition> {
    let parts = [&choice.gate.requires, &choice.gate.when]
        .into_iter()
        .flatten()
        .filter_map(gate_requirement)
        .collect();
    all_of(parts)
}

/// A gate as a requirement tree, with negation pushed down to the leaves.
///
/// Conditions we cannot express as something to go and achieve — `visited`,
/// `atNode` — are dropped, but only where dropping *weakens* the result, so
/// what survives is still implied by the gate holding. That is any conjunctive
/// position: a positive `All`, or a negated `Any`. In a disjunctive position
/// dropping an alternative would instead demand more than the gate does, so the
/// whole disjunction is abandoned.
fn gate_requirement(gate: &Gate) -> Option<Precondition> {
    requirement_of(gate, true)
}

/// `positive == false` builds the requirement for the gate having to *fail*.
fn requirement_of(gate: &Gate, positive: bool) -> Option<Precondition> {
    match (gate, positive) {
        (Gate::Not(inner), _) => requirement_of(inner, !positive),
        (Gate::Condition(condition), true) => condition_to_precondition(condition),
        (Gate::Condition(condition), false) => {
            condition_to_precondition(condition).map(|pre| Precondition::Not(Box::new(pre)))
        }
        (Gate::All(children), true) => all_of(
            children
                .iter()
                .filter_map(|child| requirement_of(child, true))
                .collect(),
        ),
        (Gate::Any(children), false) => all_of(
            children
                .iter()
                .filter_map(|child| requirement_of(child, false))
                .collect(),
        ),
        (Gate::Any(children), true) => any_of(
            children
                .iter()
                .map(|child| requirement_of(child, true))
                .collect::<Option<_>>()?,
        ),
        (Gate::All(children), false) => any_of(
            children
                .iter()
                .map(|child| requirement_of(child, false))
                .collect::<Option<_>>()?,
        ),
    }
}

/// Canonical "all of" node: nested conjunctions spliced in, deduped and sorted
/// so equal requirements reached by different routes share a label, and unwrapped
/// when only one part survives.
fn all_of(parts: Vec<Precondition>) -> Option<Precondition> {
    let mut flat = Vec::with_capacity(parts.len());
    for part in parts {
        match part {
            Precondition::AllOf { parts } => flat.extend(parts),
            other => flat.push(other),
        }
    }
    match canonicalize(flat) {
        Some(one) if one.len() == 1 => one.into_iter().next(),
        Some(many) => Some(Precondition::AllOf { parts: many }),
        None => None,
    }
}

fn any_of(alternatives: Vec<Precondition>) -> Option<Precondition> {
    let mut flat = Vec::with_capacity(alternatives.len());
    for alternative in alternatives {
        match alternative {
            Precondition::AnyOf { alternatives } => flat.extend(alternatives),
            other => flat.push(other),
        }
    }
    match canonicalize(flat) {
        Some(one) if one.len() == 1 => one.into_iter().next(),
        Some(many) => Some(Precondition::AnyOf { alternatives: many }),
        None => None,
    }
}

/// Dedupe and sort by label. A tree wider than [`MAX_DISJUNCTION_WIDTH`] is
/// abandoned rather than truncated: truncating a disjunction would drop real
/// alternatives and make the requirement falsely unsatisfiable, and truncating a
/// conjunction would make it falsely satisfiable.
fn canonicalize(mut children: Vec<Precondition>) -> Option<Vec<Precondition>> {
    dedupe_preconditions(&mut children);
    children.sort_by_key(Precondition::label);
    if children.is_empty() || children.len() > MAX_DISJUNCTION_WIDTH {
        return None;
    }
    Some(children)
}

/// For each requirement, compute its "acquire distance" field (see
/// [`GoalPreconditions::acquire`]). Returns `None` for any requirement whose
/// granting nodes could not be located.
fn build_acquire_fields(
    content: &GameContent,
    graph: &GraphIndex,
    requirements: &[Precondition],
    blocked_setters: &[Option<Vec<bool>>],
    goal_dist: &Distances,
) -> Vec<Option<Distances>> {
    requirements
        .iter()
        .enumerate()
        .map(|(i, req)| {
            let blocked = blocked_setters.get(i).and_then(Option::as_deref);
            acquire_field(content, graph, req, blocked, goal_dist)
        })
        .collect()
}

/// Acquire distances for one requirement, following its tree rather than
/// flattening it. A disjunction takes the nearer alternative; a conjunction
/// takes the farther part, so a branch with one unobtainable part drops out
/// instead of keeping the whole requirement looking achievable.
fn acquire_field(
    content: &GameContent,
    graph: &GraphIndex,
    req: &Precondition,
    blocked: Option<&[bool]>,
    goal_dist: &Distances,
) -> Option<Distances> {
    match req {
        Precondition::AnyOf { alternatives } => alternatives
            .iter()
            .filter_map(|alt| acquire_field(content, graph, alt, blocked, goal_dist))
            .reduce(|a, b| a.min_with(&b)),
        Precondition::AllOf { parts } => parts
            .iter()
            .map(|part| acquire_field(content, graph, part, blocked, goal_dist))
            .try_fold(None::<Distances>, |acc, part| {
                let part = part?;
                Some(Some(match acc {
                    Some(acc) => acc.max_with(&part),
                    None => part,
                }))
            })
            .flatten(),
        leaf => {
            let mut setters = setter_indices(content, graph, leaf);
            if let Some(blocked) = blocked {
                setters.retain(|&idx| !blocked[idx as usize]);
            }
            if !setters.is_empty() {
                return Some(graph.acquire_distances(&setters, goal_dist));
            }
            // An unmet `Not` means a flag that was set; with nothing anywhere
            // that clears it, the state is locked out for good. Say so as an
            // all-unreachable field so `search_priority` buries it, rather than
            // as "unknown", which would leave it looking one step from the goal.
            match leaf {
                Precondition::Not(_) => Some(Distances::unreachable()),
                _ => None,
            }
        }
    }
}

/// True when entering `node` or taking one of its choices grants `req`.
///
/// A choice whose own gate *positively* tests `req` (directly or inside an
/// `Any`) is not a setter: it can only fire when the requirement — or a sibling
/// resource derived from it — is already in hand, so treating it as a source
/// would fabricate an acquisition route that skips the real one (e.g. a record
/// choice gated `Any(item:testimony, flag:truth_received)` that re-asserts the
/// flag). Negative mentions (`unless`/`Not`, the usual set-once guard) are fine.
fn node_grants(node: &NodeContent, req: &Precondition) -> bool {
    // Recurse per child rather than testing the compound as a whole: the
    // circular-setter rule is about the specific thing being granted, so a
    // choice gated on one child may still be a legitimate source of another.
    if let Some(children) = req.children() {
        return children.iter().any(|child| node_grants(node, child));
    }
    if node.on_enter.iter().any(|e| effect_grants(e, req)) {
        return true;
    }
    node.choices.iter().any(|choice| {
        !gate_mentions_positively(choice, req)
            && choice_effects(choice).iter().any(|e| effect_grants(e, req))
    })
}

/// Like [`node_grants`], but additionally requires a granting route whose
/// conjunctive gate does not demand `cand` — used by the transitive necessity
/// test, where all `cand`-gated routes are considered deleted.
fn node_grants_without(node: &NodeContent, req: &Precondition, cand: &Precondition) -> bool {
    if let Some(children) = req.children() {
        return children
            .iter()
            .any(|child| node_grants_without(node, child, cand));
    }
    if node.on_enter.iter().any(|e| effect_grants(e, req)) {
        return true;
    }
    let cand_label = cand.label();
    let mut scratch = Vec::new();
    node.choices.iter().any(|choice| {
        if gate_mentions_positively(choice, req) {
            return false;
        }
        scratch.clear();
        collect_from_choice_gate(choice, &mut scratch);
        if scratch.iter().any(|p| p.label() == cand_label) {
            return false;
        }
        choice_effects(choice).iter().any(|e| effect_grants(e, req))
    })
}

fn gate_mentions_positively(choice: &ChoiceContent, req: &Precondition) -> bool {
    [&choice.gate.requires, &choice.gate.when]
        .into_iter()
        .flatten()
        .any(|gate| gate_mentions(gate, req, true))
}

fn gate_mentions(gate: &Gate, req: &Precondition, positive: bool) -> bool {
    match gate {
        Gate::All(children) | Gate::Any(children) => children
            .iter()
            .any(|child| gate_mentions(child, req, positive)),
        Gate::Not(inner) => gate_mentions(inner, req, !positive),
        Gate::Condition(condition) => positive && condition_matches_req(condition, req),
    }
}

/// Identity match between a gate condition and a requirement — name-level, not
/// value-level: any positive read of the same flag/item/actor counts.
fn condition_matches_req(condition: &Condition, req: &Precondition) -> bool {
    match (condition, req) {
        (Condition::HasFlag { flag, .. }, Precondition::Flag { flag: f, .. }) => flag == f,
        (Condition::HasItem { item_id, .. }, Precondition::Item { item_id: id, .. }) => {
            item_id == id
        }
        (Condition::ActorPresent { character_id, .. }, Precondition::Actor { character_id: c }) => {
            character_id == c
        }
        _ => false,
    }
}

/// True when `effect` moves `req` toward being met. For a discrete requirement
/// that means granting it outright; for a numeric one it means a step in the
/// required direction, since a threshold is usually reached over several nodes
/// and the acquire field only needs to know where those nodes are.
fn effect_grants(effect: &Effect, req: &Precondition) -> bool {
    // Restoring a broken `Not` means writing the flag back to a value the inner
    // requirement rejects. Nothing else in the effect vocabulary can undo one.
    if let Precondition::Not(inner) = req {
        let (Effect::SetFlag { flag, value, .. }, Precondition::Flag { flag: f, value: v }) =
            (effect, inner.as_ref())
        else {
            return false;
        };
        return flag == f && value.clone().unwrap_or(DynamicValue::Bool(true)) != *v;
    }
    match (effect, req) {
        (Effect::SetFlag { flag, value, .. }, Precondition::Flag { flag: f, value: v }) => {
            flag == f && value.clone().unwrap_or(DynamicValue::Bool(true)) == *v
        }
        (
            Effect::AddItem { item_id, count, .. },
            Precondition::Item {
                item_id: id,
                count: need,
            },
        ) => item_id == id && count.unwrap_or(1) >= *need,
        (
            Effect::SetActorPresent {
                character_id,
                value: true,
            },
            Precondition::Actor { character_id: c },
        ) => character_id == c,
        (
            _,
            Precondition::RelationshipGte {
                character_id,
                metric,
                ..
            },
        ) => relationship_delta(effect, character_id, metric).is_some_and(|d| d > 0),
        (
            _,
            Precondition::RelationshipLte {
                character_id,
                metric,
                ..
            },
        ) => relationship_delta(effect, character_id, metric).is_some_and(|d| d < 0),
        (
            _,
            Precondition::RelationshipEq {
                character_id,
                metric,
                ..
            },
        ) => relationship_delta(effect, character_id, metric).is_some_and(|d| d != 0),
        (_, Precondition::StatGte { stat, .. }) => stat_delta(effect, stat).is_some_and(|d| d > 0),
        (_, Precondition::StatLte { stat, .. }) => stat_delta(effect, stat).is_some_and(|d| d < 0),
        (_, Precondition::StatEq { stat, .. }) => stat_delta(effect, stat).is_some_and(|d| d != 0),
        _ => false,
    }
}

/// How much taking a choice carrying `effect` moves an unmet `req` forward.
/// Discrete requirements score only on an outright grant; numeric ones also
/// score for a step in the right direction, so a metric that needs several
/// increments produces a gradient instead of one all-or-nothing jump.
fn effect_bonus(effect: &Effect, req: &Precondition, state: &GameState) -> u32 {
    const COMPLETES: u32 = 25;
    const STEP: u32 = 10;

    match req {
        // Either way the best a single effect can do is advance one child.
        Precondition::AnyOf {
            alternatives: children,
        }
        | Precondition::AllOf { parts: children } => children
            .iter()
            .map(|child| effect_bonus(effect, child, state))
            .max()
            .unwrap_or(0),
        Precondition::Flag { .. } | Precondition::Actor { .. } => {
            if effect_grants(effect, req) {
                30
            } else {
                0
            }
        }
        Precondition::Item { .. } => {
            if effect_grants(effect, req) {
                20
            } else {
                0
            }
        }
        // Nothing advances a broken `Not`; only its absence from the path helps.
        Precondition::Not(_) => 0,
        Precondition::RelationshipGte {
            character_id,
            metric,
            value,
        } => match relationship_delta(effect, character_id, metric) {
            Some(delta) if delta > 0 => completion(
                rel_score(state, character_id, metric) + delta >= *value,
                COMPLETES,
                STEP,
            ),
            _ => 0,
        },
        Precondition::RelationshipLte {
            character_id,
            metric,
            value,
        } => match relationship_delta(effect, character_id, metric) {
            Some(delta) if delta < 0 => completion(
                rel_score(state, character_id, metric) + delta <= *value,
                COMPLETES,
                STEP,
            ),
            _ => 0,
        },
        Precondition::RelationshipEq {
            character_id,
            metric,
            value,
        } => match relationship_delta(effect, character_id, metric) {
            Some(delta) if delta != 0 => completion(
                rel_score(state, character_id, metric) + delta == *value,
                COMPLETES,
                0,
            ),
            _ => 0,
        },
        Precondition::StatGte { stat, value } => match stat_delta(effect, stat) {
            Some(delta) if delta > 0 => {
                completion(stat_score(state, stat) + delta >= *value, COMPLETES, STEP)
            }
            _ => 0,
        },
        Precondition::StatLte { stat, value } => match stat_delta(effect, stat) {
            Some(delta) if delta < 0 => {
                completion(stat_score(state, stat) + delta <= *value, COMPLETES, STEP)
            }
            _ => 0,
        },
        Precondition::StatEq { stat, value } => match stat_delta(effect, stat) {
            Some(delta) if delta != 0 => {
                completion(stat_score(state, stat) + delta == *value, COMPLETES, 0)
            }
            _ => 0,
        },
    }
}

fn completion(reached: bool, completes: u32, step: u32) -> u32 {
    if reached { completes } else { step }
}

/// Static delta this effect applies to `character_id.metric`, when it is a
/// literal amount. Expression-valued amounts are unknown statically and yield
/// `None` — they simply provide no guidance.
fn relationship_delta(effect: &Effect, character_id: &str, metric: &str) -> Option<i32> {
    match effect {
        Effect::ModifyRelationship {
            character_id: c,
            metric: m,
            amount,
            ..
        } if c == character_id && m == metric => *amount,
        _ => None,
    }
}

fn stat_delta(effect: &Effect, stat: &str) -> Option<i32> {
    match effect {
        Effect::ModifyStat {
            stat: s, amount, ..
        } if s == stat => *amount,
        _ => None,
    }
}

#[inline]
fn stat_score(state: &GameState, stat: &str) -> i32 {
    state.player.stats.get(stat).copied().unwrap_or(0)
}

fn choice_effects(choice: &ChoiceContent) -> Vec<&Effect> {
    let mut out: Vec<&Effect> = choice.resolution.effects.iter().collect();
    if let Some(check) = &choice.resolution.check {
        for branch in check.branch_outcomes() {
            out.extend(branch.effects.iter());
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decode(scenario: &str) -> GameContent {
        blackbox_format::decode_scenario_bundle_json(
            scenario.as_bytes(),
            br#"{"spec":"com.blackbox.items","formatVersion":1,"items":{}}"#,
            br#"{"spec":"com.blackbox.characters","formatVersion":1,"characters":{"yuen":{"id":"yuen","name":"Yuen","relationships":{"trust":0}}}}"#,
            br#"{"spec":"com.blackbox.assets.bundle","formatVersion":1,"textures":{},"music":{},"sfx":{}}"#,
            None::<&[u8]>,
            None::<&[u8]>,
            Vec::<&[u8]>::new(),
        )
        .expect("decode")
    }

    fn requirement_labels(scenario: &str) -> Vec<String> {
        let content = decode(scenario);
        let graph = GraphIndex::build(&content);
        let slice = graph.backward_slice_with_distances("goal").0;
        GoalPreconditions::extract(&content, &graph, "goal", &slice)
            .requirements
            .iter()
            .map(Precondition::label)
            .collect()
    }

    /// The goal is behind a disjunctive gate with two ways to open it, so
    /// neither flag alone is necessary and the leaf-at-a-time necessity test
    /// finds nothing. The cut must still report the disjunction.
    #[test]
    fn disjunctive_gate_is_a_landmark() {
        let labels = requirement_labels(
            r#"{"spec":"com.blackbox.scenario","formatVersion":1,"startNodeId":"start","nodes":{
                "start":{"id":"start","choices":[
                    {"id":"earn_a","label":"A","effects":[{"type":"setFlag","flag":"a","value":true}],"goto":"hub"},
                    {"id":"earn_b","label":"B","effects":[{"type":"setFlag","flag":"b","value":true}],"goto":"hub"},
                    {"id":"skip","label":"Skip","goto":"hub"}
                ]},
                "hub":{"id":"hub","choices":[
                    {"id":"win","label":"Win","when":{"type":"any","conditions":[
                        {"type":"hasFlag","flag":"a","value":true},
                        {"type":"hasFlag","flag":"b","value":true}
                    ]},"goto":"goal"}
                ]},
                "goal":{"id":"goal","mode":"ending","choices":[]}
            }}"#,
        );
        assert_eq!(labels, vec!["any(flag:a=true|flag:b=true)"], "{labels:?}");
    }

    /// Two routes into the goal, each gated differently. Neither gate is
    /// necessary on its own, but crossing one of them is.
    #[test]
    fn separately_gated_routes_yield_one_disjunction() {
        let labels = requirement_labels(
            r#"{"spec":"com.blackbox.scenario","formatVersion":1,"startNodeId":"start","nodes":{
                "start":{"id":"start","choices":[
                    {"id":"earn_x","label":"X","effects":[{"type":"setFlag","flag":"x","value":true}],"goto":"hub"},
                    {"id":"earn_y","label":"Y","effects":[{"type":"setFlag","flag":"y","value":true}],"goto":"hub"}
                ]},
                "hub":{"id":"hub","choices":[
                    {"id":"front","label":"Front","requires":[{"type":"hasFlag","flag":"x","value":true}],"goto":"goal"},
                    {"id":"back","label":"Back","requires":[{"type":"hasFlag","flag":"y","value":true}],"goto":"goal"}
                ]},
                "goal":{"id":"goal","mode":"ending","choices":[]}
            }}"#,
        );
        assert_eq!(labels, vec!["any(flag:x=true|flag:y=true)"], "{labels:?}");
    }

    /// A relationship threshold inside a conjunction is a requirement in its own
    /// right, and the conjunction is split so each part gets its own gradient.
    #[test]
    fn relationship_threshold_survives_beside_a_disjunction() {
        let labels = requirement_labels(
            r#"{"spec":"com.blackbox.scenario","formatVersion":1,"startNodeId":"start","nodes":{
                "start":{"id":"start","choices":[
                    {"id":"befriend","label":"Befriend","effects":[{"type":"modifyRelationship","characterId":"yuen","metric":"trust","amount":1}],"goto":"start"},
                    {"id":"earn_a","label":"A","effects":[{"type":"setFlag","flag":"a","value":true}],"goto":"hub"},
                    {"id":"earn_b","label":"B","effects":[{"type":"setFlag","flag":"b","value":true}],"goto":"hub"}
                ]},
                "hub":{"id":"hub","choices":[
                    {"id":"win","label":"Win","when":{"type":"all","conditions":[
                        {"type":"any","conditions":[
                            {"type":"hasFlag","flag":"a","value":true},
                            {"type":"hasFlag","flag":"b","value":true}
                        ]},
                        {"type":"relationshipGte","characterId":"yuen","metric":"trust","value":2}
                    ]},"goto":"goal"}
                ]},
                "goal":{"id":"goal","mode":"ending","choices":[]}
            }}"#,
        );
        assert!(
            labels.contains(&"any(flag:a=true|flag:b=true)".to_string()),
            "{labels:?}"
        );
        assert!(
            labels.contains(&"rel:yuen.trust≥2".to_string()),
            "the threshold must be its own requirement, not folded away: {labels:?}"
        );
    }

    /// An `unless` inside the gate becomes a negative requirement, so a state
    /// that tripped it can be recognised as locked out. The flag it forbids is
    /// still reachable, which is exactly why the search needs to be told.
    #[test]
    fn negated_gate_condition_becomes_a_not_requirement() {
        let labels = requirement_labels(
            r#"{"spec":"com.blackbox.scenario","formatVersion":1,"startNodeId":"start","nodes":{
                "start":{"id":"start","choices":[
                    {"id":"earn_a","label":"A","effects":[{"type":"setFlag","flag":"a","value":true}],"goto":"hub"},
                    {"id":"spoil","label":"Spoil","effects":[{"type":"setFlag","flag":"spoiled","value":true}],"goto":"hub"}
                ]},
                "hub":{"id":"hub","choices":[
                    {"id":"win","label":"Win","when":{"type":"all","conditions":[
                        {"type":"hasFlag","flag":"a","value":true},
                        {"type":"not","condition":{"type":"hasFlag","flag":"spoiled","value":true}}
                    ]},"goto":"goal"}
                ]},
                "goal":{"id":"goal","mode":"ending","choices":[]}
            }}"#,
        );
        assert!(labels.contains(&"flag:a=true".to_string()), "{labels:?}");
        assert!(
            labels.contains(&"not(flag:spoiled=true)".to_string()),
            "{labels:?}"
        );
    }

    /// A choice gated only by `unless` bars nothing in advance, so it must not
    /// look like a cut — otherwise every set-once guard in a scenario would
    /// manufacture a landmark.
    #[test]
    fn purely_negative_gate_is_not_a_cut() {
        let labels = requirement_labels(
            r#"{"spec":"com.blackbox.scenario","formatVersion":1,"startNodeId":"start","nodes":{
                "start":{"id":"start","choices":[
                    {"id":"go","label":"Go","unless":{"type":"hasFlag","flag":"done","value":true},"goto":"goal"}
                ]},
                "goal":{"id":"goal","mode":"ending","choices":[]}
            }}"#,
        );
        assert!(labels.is_empty(), "{labels:?}");
    }

    fn ending_gate_content() -> GameContent {
        blackbox_format::decode_scenario_bundle_json(
            br#"{"spec":"com.blackbox.scenario","formatVersion":1,"startNodeId":"start","nodes":{"start":{"id":"start","choices":[{"id":"go","label":"Go","goto":"gate"}]},"gate":{"id":"gate","choices":[{"id":"win","label":"Win","requires":[{"type":"hasFlag","flag":"key","value":true},{"type":"hasFlag","flag":"ready","value":true}],"goto":"goal"}]},"goal":{"id":"goal","mode":"ending","choices":[]}}}"#,
            br#"{"spec":"com.blackbox.items","formatVersion":1,"items":{}}"#,
            br#"{"spec":"com.blackbox.characters","formatVersion":1,"characters":{}}"#,
            br#"{"spec":"com.blackbox.assets.bundle","formatVersion":1,"textures":{},"music":{},"sfx":{}}"#,
            None::<&[u8]>,
            None::<&[u8]>,
            Vec::<&[u8]>::new(),
        )
        .expect("decode")
    }

    #[test]
    fn extracts_gateway_preconditions() {
        let content = ending_gate_content();
        let graph = GraphIndex::build(&content);
        let slice = graph.backward_slice_with_distances("goal").0;
        let pre = GoalPreconditions::extract(&content, &graph, "goal", &slice);
        assert_eq!(pre.requirements.len(), 2);
    }

    /// Goal gated on `deep`; the only real setter of `deep` sits behind a gate
    /// on `early` — extraction must surface `early` transitively. A second
    /// route past an item-gated choice has an ungated sibling, so the item must
    /// NOT be reported (it would bury every state that legitimately bypasses
    /// it). A node that re-asserts `deep` behind a gate reading `deep` is a
    /// circular setter and must not count as a source.
    fn chained_gate_content() -> GameContent {
        blackbox_format::decode_scenario_bundle_json(
            br#"{"spec":"com.blackbox.scenario","formatVersion":1,"startNodeId":"start","nodes":{
                "start":{"id":"start","choices":[
                    {"id":"locked","label":"Locked door","requires":[{"type":"hasItem","itemId":"key","count":1}],"goto":"mid"},
                    {"id":"open","label":"Open door","goto":"mid"}
                ]},
                "mid":{"id":"mid","choices":[
                    {"id":"earn","label":"Earn deep","requires":[{"type":"hasFlag","flag":"early","value":true}],"effects":[{"type":"setFlag","flag":"deep","value":true}],"goto":"gate"},
                    {"id":"skip","label":"Skip","goto":"gate"},
                    {"id":"circular","label":"Re-assert","when":{"type":"hasFlag","flag":"deep","value":true},"effects":[{"type":"setFlag","flag":"deep","value":true}],"goto":"gate"}
                ]},
                "gate":{"id":"gate","choices":[{"id":"win","label":"Win","requires":[{"type":"hasFlag","flag":"deep","value":true}],"goto":"goal"}]},
                "goal":{"id":"goal","mode":"ending","choices":[]}
            }}"#,
            br#"{"spec":"com.blackbox.items","formatVersion":1,"items":{}}"#,
            br#"{"spec":"com.blackbox.characters","formatVersion":1,"characters":{}}"#,
            br#"{"spec":"com.blackbox.assets.bundle","formatVersion":1,"textures":{},"music":{},"sfx":{}}"#,
            None::<&[u8]>,
            None::<&[u8]>,
            Vec::<&[u8]>::new(),
        )
        .expect("decode")
    }

    #[test]
    fn necessity_closes_over_setters_and_skips_alternatives() {
        let content = chained_gate_content();
        let graph = GraphIndex::build(&content);
        let slice = graph.backward_slice_with_distances("goal").0;
        let pre = GoalPreconditions::extract(&content, &graph, "goal", &slice);

        let labels: Vec<String> = pre.requirements.iter().map(Precondition::label).collect();
        assert!(labels.contains(&"flag:deep=true".to_string()), "{labels:?}");
        assert!(
            labels.contains(&"flag:early=true".to_string()),
            "transitive requirement behind the setter must be found: {labels:?}"
        );
        assert!(
            !labels.iter().any(|l| l.starts_with("item:key")),
            "item guarding only one of two routes must not be required: {labels:?}"
        );
    }
}
