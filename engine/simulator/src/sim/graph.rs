//! Compact static graph over scenario nodes for slice pruning and heuristics.
//!
//! Uses dense `u32` indices and bitsets instead of repeated string hashing during search.

use std::collections::VecDeque;

use rustc_hash::{FxHashMap, FxHashSet};

use blackbox::content::{ChoiceAction, ChoiceContent, Effect, GameContent, SkillCheckOutcome};

pub const DIST_UNREACHABLE: u32 = u32::MAX;

/// Dense node index built once per scenario load.
pub struct GraphIndex {
    pub node_ids: Vec<String>,
    idx: FxHashMap<String, u32>,
    forward: Vec<Vec<u32>>,
    reverse: Vec<Vec<u32>>,
    choice_targets: Vec<Vec<Vec<u32>>>,
    /// Cached set of (from, to) pairs that are progression edges.
    /// Computed once in `build`; shared across all goal searches.
    progression: FxHashSet<(u32, u32)>,
}

impl GraphIndex {
    pub fn build(content: &GameContent) -> Self {
        let mut node_ids: Vec<String> = content.nodes.keys().cloned().collect();
        node_ids.sort_unstable();

        let idx: FxHashMap<String, u32> = node_ids
            .iter()
            .enumerate()
            .map(|(i, id)| (id.clone(), i as u32))
            .collect();

        let n = node_ids.len();
        let mut choice_targets = vec![Vec::new(); n];
        let mut forward = vec![Vec::new(); n];

        for (node_id, node) in &content.nodes {
            let Some(&from) = idx.get(node_id) else {
                continue;
            };
            let from = from as usize;
            let mut edge_set = Vec::new();
            for choice in node.choices.iter() {
                let targets = static_targets(content, node_id, choice, &idx);
                choice_targets[from].push(targets.clone());
                for &t in &targets {
                    if !edge_set.contains(&t) {
                        edge_set.push(t);
                    }
                }
            }
            forward[from] = edge_set;
        }

        let mut reverse = vec![Vec::new(); n];
        for (from, edges) in forward.iter().enumerate() {
            for &to in edges {
                reverse[to as usize].push(from as u32);
            }
        }

        let progression = build_progression_edges(content, &idx);

        Self {
            node_ids,
            idx,
            forward,
            reverse,
            choice_targets,
            progression,
        }
    }

    pub fn len(&self) -> usize {
        self.node_ids.len()
    }

    pub fn index_of(&self, node_id: &str) -> Option<u32> {
        self.idx.get(node_id).copied()
    }

    pub fn id_of(&self, index: u32) -> &str {
        &self.node_ids[index as usize]
    }

    /// Single reverse BFS that returns both the backward reachability slice and
    /// the all-edges shortest distances in one pass.
    pub fn backward_slice_with_distances(&self, goal: &str) -> (Slice, Distances) {
        let n = self.len();
        let mut in_slice = vec![false; n];
        let mut dist_vals = vec![DIST_UNREACHABLE; n];
        let Some(&goal_idx) = self.idx.get(goal) else {
            return (Slice { bits: in_slice }, Distances { values: dist_vals });
        };

        in_slice[goal_idx as usize] = true;
        dist_vals[goal_idx as usize] = 0;
        let mut queue = VecDeque::new();
        queue.push_back(goal_idx);

        while let Some(node) = queue.pop_front() {
            let next_d = dist_vals[node as usize].saturating_add(1);
            for &pred in &self.reverse[node as usize] {
                let p = pred as usize;
                if !in_slice[p] {
                    in_slice[p] = true;
                    dist_vals[p] = next_d;
                    queue.push_back(pred);
                }
            }
        }

        (Slice { bits: in_slice }, Distances { values: dist_vals })
    }

    /// Shortest static path length from each node to `goal` (reverse BFS).
    /// Only follows edges that pass `edge_filter` (use `|_, _| true` for all edges).
    pub fn distances_to_with_filter<F>(&self, goal: &str, edge_filter: F) -> Distances
    where
        F: Fn(u32, u32) -> bool,
    {
        let n = self.len();
        let mut dist = vec![DIST_UNREACHABLE; n];
        let Some(&goal_idx) = self.idx.get(goal) else {
            return Distances { values: dist };
        };

        dist[goal_idx as usize] = 0;
        let mut queue = VecDeque::new();
        queue.push_back(goal_idx);

        while let Some(node) = queue.pop_front() {
            let next_d = dist[node as usize].saturating_add(1);
            for &pred in &self.reverse[node as usize] {
                if !edge_filter(pred, node) {
                    continue;
                }
                let p = pred as usize;
                if dist[p] == DIST_UNREACHABLE {
                    dist[p] = next_d;
                    queue.push_back(pred);
                }
            }
        }

        Distances { values: dist }
    }

    /// Progression-only distances (ignores restart / menu edges).
    pub fn distances_to_progression(&self, goal: &str) -> Distances {
        let prog = &self.progression;
        self.distances_to_with_filter(goal, |pred, to| prog.contains(&(pred, to)))
    }

    /// Forward progression distance from every node to the *nearest* node in
    /// `targets` (multi-source reverse BFS). Used to steer the death search into
    /// the region of the map whose deaths redirect to a given game-over node.
    pub fn distances_to_any_progression(&self, targets: &[u32]) -> Distances {
        use std::collections::VecDeque;
        let n = self.len();
        let mut dist = vec![DIST_UNREACHABLE; n];
        let mut queue = VecDeque::new();
        for &t in targets {
            if dist[t as usize] == DIST_UNREACHABLE {
                dist[t as usize] = 0;
                queue.push_back(t);
            }
        }
        let prog = &self.progression;
        while let Some(node) = queue.pop_front() {
            let next_d = dist[node as usize].saturating_add(1);
            for &pred in &self.reverse[node as usize] {
                if !prog.contains(&(pred, node)) {
                    continue;
                }
                if dist[pred as usize] == DIST_UNREACHABLE {
                    dist[pred as usize] = next_d;
                    queue.push_back(pred);
                }
            }
        }
        Distances { values: dist }
    }

    /// For every node, the length of the shortest progression path that starts
    /// at that node, passes through one of the `setter` nodes, and ends at the
    /// goal — i.e. `min over s in setters of ( dist(node → s) + goal_dist[s] )`.
    ///
    /// Used as a precondition-aware heuristic: while a required flag/item/actor
    /// is still unmet, this routes the search *through* the node that grants it
    /// rather than letting it race straight at the goal and skip the detour.
    /// Seeded Dijkstra over reverse progression edges (unit weights, but
    /// non-uniform source values, so a heap rather than a plain BFS queue).
    pub fn acquire_distances(&self, setters: &[u32], goal_dist: &Distances) -> Distances {
        use std::cmp::Reverse;
        use std::collections::BinaryHeap;

        let n = self.len();
        let mut dist = vec![DIST_UNREACHABLE; n];
        let mut heap: BinaryHeap<Reverse<(u32, u32)>> = BinaryHeap::new();

        for &s in setters {
            let seed = goal_dist.get(s);
            if seed != DIST_UNREACHABLE && seed < dist[s as usize] {
                dist[s as usize] = seed;
                heap.push(Reverse((seed, s)));
            }
        }

        let prog = &self.progression;
        while let Some(Reverse((d, node))) = heap.pop() {
            if d > dist[node as usize] {
                continue;
            }
            // Relax predecessors `p` with edge `p → node` (we are walking the
            // path backwards from a setter towards earlier nodes).
            for &pred in &self.reverse[node as usize] {
                if !prog.contains(&(pred, node)) {
                    continue;
                }
                let nd = d.saturating_add(1);
                if nd < dist[pred as usize] {
                    dist[pred as usize] = nd;
                    heap.push(Reverse((nd, pred)));
                }
            }
        }

        Distances { values: dist }
    }

    /// For each node, count how many terminal nodes (endings / game_overs) are in its
    /// forward reach — i.e., the node appears in that many terminals' backward slices.
    /// Returns `(total_terminals, per_node_counts)`.
    pub fn node_ending_coverage(&self, content: &GameContent) -> (usize, Vec<usize>) {
        let n = self.len();
        let mut counts = vec![0usize; n];
        let mut total = 0usize;
        for (node_id, node) in &content.nodes {
            if !node.mode.is_terminal() {
                continue;
            }
            total += 1;
            let (slice, _) = self.backward_slice_with_distances(node_id);
            for (i, count) in counts.iter_mut().enumerate() {
                if slice.contains(i as u32) {
                    *count += 1;
                }
            }
        }
        (total, counts)
    }

    /// Static structural analysis: dead ends and trapping loops.
    ///
    /// Dead ends: non-terminal nodes reachable from `start_id` that cannot reach
    /// any terminal node (ending / game_over) via any path.
    ///
    /// Trapping loops: SCCs of 2+ dead nodes (or a single dead node with a
    /// self-loop) — cycles from which the player can never escape.
    pub fn static_analysis(&self, content: &GameContent, start_id: &str) -> StaticIssueSet {
        let n = self.len();

        let mut can_reach_terminal = vec![false; n];
        let mut queue = VecDeque::new();
        for (node_id, node) in &content.nodes {
            if node.mode.is_terminal()
                && let Some(&idx) = self.idx.get(node_id)
            {
                let i = idx as usize;
                if !can_reach_terminal[i] {
                    can_reach_terminal[i] = true;
                    queue.push_back(idx);
                }
            }
        }
        while let Some(node) = queue.pop_front() {
            for &pred in &self.reverse[node as usize] {
                let p = pred as usize;
                if !can_reach_terminal[p] {
                    can_reach_terminal[p] = true;
                    queue.push_back(pred);
                }
            }
        }

        let mut reachable = vec![false; n];
        if let Some(&start_idx) = self.idx.get(start_id) {
            reachable[start_idx as usize] = true;
            queue.push_back(start_idx);
            while let Some(node) = queue.pop_front() {
                for &succ in &self.forward[node as usize] {
                    let s = succ as usize;
                    if !reachable[s] {
                        reachable[s] = true;
                        queue.push_back(succ);
                    }
                }
            }
        }

        // Dead nodes: reachable from start, not a terminal, cannot reach any terminal.
        let is_dead: Vec<bool> = (0..n)
            .map(|i| {
                let is_terminal = content
                    .nodes
                    .get(&self.node_ids[i])
                    .map(|nd| nd.mode.is_terminal())
                    .unwrap_or(false);
                reachable[i] && !is_terminal && !can_reach_terminal[i]
            })
            .collect();

        // Tarjan's SCC on the dead-node subgraph to find trapping cycles.
        let sccs = tarjan_sccs_subset(&self.forward, &is_dead, n);

        let mut in_trapping_loop = vec![false; n];
        let mut trapping_loops: Vec<Vec<String>> = Vec::new();

        for scc in sccs {
            let has_self_loop = scc.len() == 1 && self.forward[scc[0] as usize].contains(&scc[0]);
            if scc.len() >= 2 || has_self_loop {
                let mut node_ids: Vec<String> = scc
                    .iter()
                    .map(|&i| self.node_ids[i as usize].clone())
                    .collect();
                node_ids.sort_unstable();
                for &i in &scc {
                    in_trapping_loop[i as usize] = true;
                }
                trapping_loops.push(node_ids);
            }
        }

        let mut dead_end_nodes: Vec<String> = (0..n)
            .filter(|&i| is_dead[i] && !in_trapping_loop[i])
            .map(|i| self.node_ids[i].clone())
            .collect();
        dead_end_nodes.sort_unstable();

        StaticIssueSet {
            dead_end_nodes,
            trapping_loops,
        }
    }

    /// True when any static branch of this choice stays inside the goal slice.
    pub fn choice_in_slice(&self, node_id: &str, choice_index: usize, slice: &Slice) -> bool {
        let Some(&from) = self.idx.get(node_id) else {
            return false;
        };
        let Some(targets) = self
            .choice_targets
            .get(from as usize)
            .and_then(|c| c.get(choice_index))
        else {
            return false;
        };
        targets.iter().any(|&t| slice.contains(t))
    }
}

fn build_progression_edges(
    content: &GameContent,
    idx: &FxHashMap<String, u32>,
) -> FxHashSet<(u32, u32)> {
    let mut edges = FxHashSet::default();
    for (node_id, node) in &content.nodes {
        let Some(&from) = idx.get(node_id) else {
            continue;
        };
        for choice in &node.choices {
            if is_non_progression_action(&choice.resolution.action) {
                continue;
            }
            for target in choice_branch_targets_impl(content, choice, node_id) {
                if let Some(&to) = idx.get(&target) {
                    edges.insert((from, to));
                }
            }
        }
    }
    edges
}

pub fn is_non_progression_action(action: &Option<ChoiceAction>) -> bool {
    matches!(
        action,
        Some(ChoiceAction::RestartGame { .. })
            | Some(ChoiceAction::OpenMainMenu)
            | Some(ChoiceAction::OpenLoadMenu)
    )
}

#[derive(Clone)]
pub struct Slice {
    bits: Vec<bool>,
}

impl Slice {
    pub fn contains(&self, idx: u32) -> bool {
        self.bits.get(idx as usize).copied().unwrap_or(false)
    }

    pub fn contains_id(&self, graph: &GraphIndex, node_id: &str) -> bool {
        graph
            .index_of(node_id)
            .is_some_and(|idx| self.contains(idx))
    }
}

#[derive(Debug, Clone)]
pub struct Distances {
    values: Vec<u32>,
}

impl Distances {
    /// Empty distances table where every node is unreachable.
    pub fn unreachable() -> Self {
        Self { values: Vec::new() }
    }

    pub fn get(&self, idx: u32) -> u32 {
        self.values
            .get(idx as usize)
            .copied()
            .unwrap_or(DIST_UNREACHABLE)
    }

    /// Among visited node indices, return the one with smallest distance to goal.
    pub fn closest_among(&self, visited: &[u32]) -> Option<u32> {
        visited
            .iter()
            .copied()
            .filter(|&idx| self.get(idx) != DIST_UNREACHABLE)
            .min_by_key(|&idx| self.get(idx))
    }
}

fn static_targets(
    content: &GameContent,
    current_node: &str,
    choice: &ChoiceContent,
    idx: &FxHashMap<String, u32>,
) -> Vec<u32> {
    let mut targets = Vec::new();
    for branch in choice_branch_targets_impl(content, choice, current_node) {
        if let Some(&t) = idx.get(&branch)
            && !targets.contains(&t)
        {
            targets.push(t);
        }
    }
    targets
}

/// Static navigation targets for a choice (public for precondition analysis).
pub fn choice_branch_targets_for(
    content: &GameContent,
    choice: &ChoiceContent,
    current_node: &str,
) -> Vec<String> {
    choice_branch_targets_impl(content, choice, current_node)
}

fn choice_branch_targets_impl(
    content: &GameContent,
    choice: &ChoiceContent,
    current_node: &str,
) -> Vec<String> {
    let base = &choice.resolution.effects;

    if let Some(check) = &choice.resolution.check {
        let mut out = Vec::new();
        push_target(&mut out, current_node, base, &check.on_success);
        push_target(&mut out, current_node, base, &check.on_failure);
        if let Some(exhausted) = &check.on_exhausted {
            push_target(&mut out, current_node, base, exhausted);
        }
        return out;
    }

    let mut out = Vec::new();
    if let Some(target) = navigation_target(content, choice) {
        out.push(target);
    } else if !base.is_empty() {
        out.push(current_node.to_string());
    }
    out
}

fn push_target(
    out: &mut Vec<String>,
    current_node: &str,
    base: &[Effect],
    outcome: &SkillCheckOutcome,
) {
    if outcome.goto.is_some() || !outcome.effects.is_empty() || !base.is_empty() {
        let target = outcome
            .goto
            .clone()
            .unwrap_or_else(|| current_node.to_string());
        if !out.contains(&target) {
            out.push(target);
        }
    }
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

/// Results of the static structural analysis pass.
pub struct StaticIssueSet {
    /// Non-terminal nodes reachable from the start that cannot reach any terminal.
    /// These are isolated dead ends (not part of a cycle).
    pub dead_end_nodes: Vec<String>,
    /// SCCs of 2+ dead nodes (or single nodes with self-loops) — inescapable cycles.
    pub trapping_loops: Vec<Vec<String>>,
}

/// Iterative Tarjan's SCC restricted to nodes where `include[i]` is true.
/// Only edges between included nodes are followed.
fn tarjan_sccs_subset(full_adj: &[Vec<u32>], include: &[bool], n: usize) -> Vec<Vec<u32>> {
    let adj: Vec<Vec<u32>> = (0..n)
        .map(|i| {
            if !include[i] {
                Vec::new()
            } else {
                full_adj[i]
                    .iter()
                    .copied()
                    .filter(|&w| include[w as usize])
                    .collect()
            }
        })
        .collect();

    let mut counter = 0u32;
    let mut stack: Vec<u32> = Vec::new();
    let mut on_stack = vec![false; n];
    let mut disc = vec![u32::MAX; n];
    let mut low = vec![0u32; n];
    let mut sccs: Vec<Vec<u32>> = Vec::new();
    let mut dfs: Vec<(u32, usize)> = Vec::new(); // (node, next-child index)

    for root in 0..n as u32 {
        let root_us = root as usize;
        if !include[root_us] || disc[root_us] != u32::MAX {
            continue;
        }

        disc[root_us] = counter;
        low[root_us] = counter;
        counter += 1;
        stack.push(root);
        on_stack[root_us] = true;
        dfs.push((root, 0));

        while !dfs.is_empty() {
            let (v, ci) = *dfs.last().unwrap();
            let v_us = v as usize;

            if ci < adj[v_us].len() {
                // Advance child iterator before any push so the borrow is released.
                dfs.last_mut().unwrap().1 += 1;
                let w = adj[v_us][ci];
                let w_us = w as usize;

                if disc[w_us] == u32::MAX {
                    disc[w_us] = counter;
                    low[w_us] = counter;
                    counter += 1;
                    stack.push(w);
                    on_stack[w_us] = true;
                    dfs.push((w, 0));
                } else if on_stack[w_us] {
                    low[v_us] = low[v_us].min(disc[w_us]);
                }
            } else {
                dfs.pop();
                if let Some(&(parent, _)) = dfs.last() {
                    let p = parent as usize;
                    low[p] = low[p].min(low[v_us]);
                }
                if low[v_us] == disc[v_us] {
                    let mut scc = Vec::new();
                    loop {
                        let w = stack.pop().unwrap() as usize;
                        on_stack[w] = false;
                        scc.push(w as u32);
                        if w == v_us {
                            break;
                        }
                    }
                    sccs.push(scc);
                }
            }
        }
    }

    sccs
}

#[cfg(test)]
mod tests {
    use super::*;
    use blackbox::GameContent;

    fn tiny_content() -> GameContent {
        blackbox_format::decode_scenario_bundle_json(
            br#"{"spec":"com.blackbox.scenario","formatVersion":1,"startNodeId":"start","nodes":{"start":{"id":"start","choices":[{"id":"a","label":"A","goto":"mid"},{"id":"b","label":"B","goto":"dead"}]},"mid":{"id":"mid","choices":[{"id":"c","label":"C","goto":"goal"}]},"dead":{"id":"dead","choices":[]},"goal":{"id":"goal","mode":"ending","choices":[]}}}"#,
            br#"{"spec":"com.blackbox.items","formatVersion":1,"items":{}}"#,
            br#"{"spec":"com.blackbox.characters","formatVersion":1,"characters":{}}"#,
            br#"{"spec":"com.blackbox.assets.bundle","formatVersion":1,"textures":{},"music":{},"sfx":{}}"#,
            None::<&[u8]>,
            None::<&[u8]>,
            Vec::<&[u8]>::new(),
        )
        .expect("decode")
    }

    fn dead_end_content() -> GameContent {
        blackbox_format::decode_scenario_bundle_json(
            // start → live → ending (reachable, can reach terminal)
            // start → sink (reachable, no path to any terminal → static dead end)
            // isolated (unreachable from start, also can't reach terminal — not a dead end in our sense)
            br#"{"spec":"com.blackbox.scenario","formatVersion":1,"startNodeId":"start","nodes":{"start":{"id":"start","choices":[{"id":"go_live","label":"Live","goto":"live"},{"id":"go_sink","label":"Sink","goto":"sink"}]},"live":{"id":"live","choices":[{"id":"end","label":"End","goto":"ending"}]},"sink":{"id":"sink","choices":[{"id":"loop","label":"Loop","goto":"sink"}]},"ending":{"id":"ending","mode":"ending","choices":[]},"isolated":{"id":"isolated","choices":[]}}}"#,
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
    fn static_analysis_detects_self_loop_dead_end() {
        let content = dead_end_content();
        let graph = GraphIndex::build(&content);
        let issues = graph.static_analysis(&content, "start");
        assert!(
            issues.dead_end_nodes.is_empty(),
            "no isolated dead ends expected"
        );
        assert_eq!(issues.trapping_loops.len(), 1);
        assert_eq!(issues.trapping_loops[0], vec!["sink".to_string()]);
    }

    fn two_node_loop_content() -> GameContent {
        // start → a ⇄ b (cycle, no terminal reachable from a/b)
        blackbox_format::decode_scenario_bundle_json(
            br#"{"spec":"com.blackbox.scenario","formatVersion":1,"startNodeId":"start","nodes":{"start":{"id":"start","choices":[{"id":"go","label":"Go","goto":"ending"},{"id":"trap","label":"Trap","goto":"a"}]},"a":{"id":"a","choices":[{"id":"to_b","label":"ToB","goto":"b"}]},"b":{"id":"b","choices":[{"id":"to_a","label":"ToA","goto":"a"}]},"ending":{"id":"ending","mode":"ending","choices":[]}}}"#,
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
    fn static_analysis_detects_two_node_trapping_loop() {
        let content = two_node_loop_content();
        let graph = GraphIndex::build(&content);
        let issues = graph.static_analysis(&content, "start");
        assert!(issues.dead_end_nodes.is_empty());
        assert_eq!(issues.trapping_loops.len(), 1);
        let loop_nodes = &issues.trapping_loops[0];
        assert!(loop_nodes.contains(&"a".to_string()));
        assert!(loop_nodes.contains(&"b".to_string()));
    }

    #[test]
    fn static_analysis_clean_when_all_nodes_reach_terminal() {
        let content = tiny_content();
        let graph = GraphIndex::build(&content);
        let issues = graph.static_analysis(&content, "start");
        assert_eq!(issues.dead_end_nodes, vec!["dead".to_string()]);
        assert!(issues.trapping_loops.is_empty());
    }

    #[test]
    fn backward_slice_excludes_dead_branch() {
        let content = tiny_content();
        let graph = GraphIndex::build(&content);
        let slice = graph.backward_slice_with_distances("goal").0;
        assert!(slice.contains_id(&graph, "start"));
        assert!(slice.contains_id(&graph, "mid"));
        assert!(slice.contains_id(&graph, "goal"));
        assert!(!slice.contains_id(&graph, "dead"));
    }

    #[test]
    fn distances_increase_away_from_goal() {
        let content = tiny_content();
        let graph = GraphIndex::build(&content);
        let dist = graph.distances_to_with_filter("goal", |_, _| true);
        let goal = graph.index_of("goal").unwrap();
        let mid = graph.index_of("mid").unwrap();
        let start = graph.index_of("start").unwrap();
        let dead = graph.index_of("dead").unwrap();
        assert_eq!(dist.get(goal), 0);
        assert_eq!(dist.get(mid), 1);
        assert_eq!(dist.get(start), 2);
        assert_eq!(dist.get(dead), DIST_UNREACHABLE);
    }
}
