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
}

impl Precondition {
    pub fn label(&self) -> String {
        match self {
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

    pub fn is_satisfied(&self, state: &GameState) -> bool {
        match self {
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
    /// `Some(d)` for flag/item/actor requirements whose granting nodes were
    /// located: `d[node]` is the shortest progression path from `node` through a
    /// granting node to the goal. `None` for stat/relationship requirements
    /// (acquired by gradual modification, steered by `choice_progress_bonus`
    /// instead) or requirements with no known setter.
    pub acquire: Vec<Option<super::graph::Distances>>,
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
            progression_distances: super::graph::Distances::unreachable(),
        }
    }
}

/// Cap on transitively collected requirements — bounds extraction work and
/// keeps the missing-precondition report readable on pathological content.
const MAX_TRANSITIVE_REQUIREMENTS: usize = 48;

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

        let acquire = build_acquire_fields(content, graph, &requirements, &dist);
        Self {
            requirements,
            acquire,
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
            }
        }
        self.acquire = build_acquire_fields(
            content,
            graph,
            &self.requirements,
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
            .map(Precondition::label)
            .collect()
    }

    pub fn choice_progress_bonus(&self, choice: &ChoiceContent, state: &GameState) -> u32 {
        let mut bonus = 0u32;
        for effect in choice_effects(choice) {
            match effect {
                Effect::SetFlag { flag, value, .. } => {
                    let sets = value.clone().unwrap_or(DynamicValue::Bool(true));
                    for req in &self.requirements {
                        if let Precondition::Flag { flag: f, value: v } = req
                            && f == flag
                            && !req.is_satisfied(state)
                            && *v == sets
                        {
                            bonus = bonus.saturating_add(30);
                        }
                    }
                }
                Effect::SetActorPresent {
                    character_id,
                    value: true,
                } => {
                    for req in &self.requirements {
                        if let Precondition::Actor { character_id: id } = req
                            && id == character_id
                            && !req.is_satisfied(state)
                        {
                            bonus = bonus.saturating_add(30);
                        }
                    }
                }
                Effect::AddItem { item_id, count, .. } => {
                    let added = count.unwrap_or(1);
                    for req in &self.requirements {
                        if let Precondition::Item {
                            item_id: id,
                            count: need,
                        } = req
                            && id == item_id
                            && !req.is_satisfied(state)
                            && added >= *need
                        {
                            bonus = bonus.saturating_add(20);
                        }
                    }
                }
                Effect::ModifyRelationship {
                    character_id,
                    metric,
                    amount: Some(delta),
                    ..
                } => {
                    for req in &self.requirements {
                        match req {
                            Precondition::RelationshipGte {
                                character_id: c,
                                metric: m,
                                value: need,
                            } if c == character_id
                                && m == metric
                                && !req.is_satisfied(state)
                                && rel_score(state, c, m) + delta >= *need =>
                            {
                                bonus = bonus.saturating_add(25);
                            }
                            Precondition::RelationshipLte {
                                character_id: c,
                                metric: m,
                                value: need,
                            } if c == character_id
                                && m == metric
                                && !req.is_satisfied(state)
                                && rel_score(state, c, m) + delta <= *need =>
                            {
                                bonus = bonus.saturating_add(25);
                            }
                            _ => {}
                        }
                    }
                }
                _ => {}
            }
        }
        bonus
    }

    pub fn gateway_snapshot(&self, state: &GameState) -> Vec<(String, String)> {
        self.requirements
            .iter()
            .map(|p| {
                let label = p.label();
                let status = if p.is_satisfied(state) { "✓" } else { "✗" };
                (label, status.to_string())
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

/// For each requirement, compute its "acquire distance" field (see
/// [`GoalPreconditions::acquire`]). Returns `None` for any requirement that is
/// not a discrete grant or whose granting node could not be located.
fn build_acquire_fields(
    content: &GameContent,
    graph: &GraphIndex,
    requirements: &[Precondition],
    goal_dist: &Distances,
) -> Vec<Option<Distances>> {
    requirements
        .iter()
        .map(|req| {
            if !matches!(
                req,
                Precondition::Flag { .. } | Precondition::Item { .. } | Precondition::Actor { .. }
            ) {
                return None;
            }
            let setters = setter_indices(content, graph, req);
            if setters.is_empty() {
                return None;
            }
            Some(graph.acquire_distances(&setters, goal_dist))
        })
        .collect()
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

fn effect_grants(effect: &Effect, req: &Precondition) -> bool {
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
        _ => false,
    }
}

fn choice_effects(choice: &ChoiceContent) -> Vec<&Effect> {
    let mut out: Vec<&Effect> = choice.resolution.effects.iter().collect();
    if let Some(check) = &choice.resolution.check {
        for branch in [
            Some(&check.on_success),
            Some(&check.on_failure),
            check.on_exhausted.as_ref(),
        ]
        .into_iter()
        .flatten()
        {
            out.extend(branch.effects.iter());
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

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
