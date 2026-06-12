use blackbox::content::{GameContent, NodeMode};

use super::graph::{GraphIndex, Slice};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GoalFilter {
    Ending,
    GameOver,
    All,
}

impl GoalFilter {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "ending" => Some(Self::Ending),
            "game_over" => Some(Self::GameOver),
            "all" => Some(Self::All),
            _ => None,
        }
    }
}

/// Resolve goal node ids from content and CLI filter.
pub fn discover_goals(content: &GameContent, filter: GoalFilter) -> Vec<String> {
    let mut goals: Vec<String> = content
        .nodes
        .iter()
        .filter(|(_, node)| match filter {
            GoalFilter::Ending => node.mode == NodeMode::Ending,
            GoalFilter::GameOver => node.mode == NodeMode::GameOver,
            GoalFilter::All => node.mode.is_terminal(),
        })
        .map(|(id, _)| id.clone())
        .collect();
    goals.sort_unstable();
    goals
}

pub struct GoalPlan {
    pub goal_id: String,
    pub slice: Slice,
    pub statically_reachable: bool,
    pub preconditions: super::preconditions::GoalPreconditions,
}

impl GoalPlan {
    pub fn build(graph: &GraphIndex, content: &GameContent, goal_id: &str) -> Self {
        // One BFS yields both the backward slice and all-edge distances.
        let (slice, _all_dist) = graph.backward_slice_with_distances(goal_id);
        let statically_reachable = slice.contains_id(graph, &content.start_node_id);
        // Precondition extraction computes progression-only distances as a side effect;
        // those are stored inside GoalPreconditions and reused as the search heuristic.
        let preconditions =
            super::preconditions::GoalPreconditions::extract(content, graph, goal_id, &slice);
        Self {
            goal_id: goal_id.to_string(),
            slice,
            statically_reachable,
            preconditions,
        }
    }
}

/// Chapter entry points for milestone reporting (Phase 3).
pub struct Milestones {
    pub entries: Vec<Milestone>,
}

pub struct Milestone {
    pub title: String,
    pub node_id: String,
    pub node_idx: u32,
}

impl Milestones {
    pub fn from_content(content: &GameContent, graph: &GraphIndex) -> Self {
        let mut entries = Vec::with_capacity(content.chapters.len());
        for chapter in &content.chapters {
            if let Some(node_idx) = graph.index_of(&chapter.start_node_id) {
                entries.push(Milestone {
                    title: chapter.title.clone(),
                    node_id: chapter.start_node_id.clone(),
                    node_idx,
                });
            }
        }
        Self { entries }
    }

    /// Visited milestone closest to `goal` (minimum static graph distance).
    /// `visited` is a dense bitset indexed by node index.
    pub fn best_reached(
        &self,
        visited: &[bool],
        dist: &super::graph::Distances,
    ) -> Option<&Milestone> {
        self.entries
            .iter()
            .filter(|m| visited.get(m.node_idx as usize).copied().unwrap_or(false))
            .min_by_key(|m| dist.get(m.node_idx))
    }
}
