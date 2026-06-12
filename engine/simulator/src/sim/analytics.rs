use std::collections::HashMap;

/// How many of the game's terminal nodes (endings / game_overs) are reachable
/// from a given node via the static graph.
#[derive(Debug, Clone)]
pub struct NodeImportance {
    pub node_id: String,
    /// Number of terminals reachable from this node.
    pub ending_count: usize,
    /// Total terminals in the game.
    pub total_endings: usize,
}

impl NodeImportance {
    pub fn pct(&self) -> f64 {
        if self.total_endings == 0 {
            return 0.0;
        }
        self.ending_count as f64 / self.total_endings as f64 * 100.0
    }
}

/// Traversal counts collected by walking path_tail on every completed
/// playthrough.  For goals mode these come from witness paths; for explore
/// mode they come from the dynamic worker threads.
#[derive(Debug, Clone, Default)]
pub struct PathCounts {
    /// Total times each node is entered across all paths (counts revisits — a
    /// looping hub can exceed the path total). This is the raw "how often hit".
    pub node_counts: HashMap<String, usize>,
    /// How many *distinct* paths pass through each node at least once. Bounded by
    /// `total`, so a clean "reach %": the fraction of playthroughs that see it.
    pub node_path_counts: HashMap<String, usize>,
    /// How many completed paths take each (node_id, choice_id) pair.
    pub choice_counts: HashMap<(String, String), usize>,
    /// How many completed paths finish at each terminal.
    pub ending_counts: HashMap<String, usize>,
    /// Per terminal: total node entries on its paths (visits, may exceed reach).
    pub per_ending_node_counts: HashMap<String, HashMap<String, usize>>,
    /// Per terminal: distinct paths through each node (reach within that ending).
    pub per_ending_path_counts: HashMap<String, HashMap<String, usize>>,
    /// Total completed paths recorded.
    pub total: usize,
}

impl PathCounts {
    /// Record one completed path.  `steps` is `(node_id, choice_id)` pairs in
    /// order; `terminal_id` is the node reached at the end.
    pub fn record_path(&mut self, steps: &[(String, String)], terminal_id: &str) {
        self.total += 1;
        *self
            .ending_counts
            .entry(terminal_id.to_string())
            .or_insert(0) += 1;

        let mut distinct: std::collections::HashSet<&str> = std::collections::HashSet::new();
        for (node_id, choice_id) in steps {
            *self.node_counts.entry(node_id.clone()).or_insert(0) += 1;
            *self
                .choice_counts
                .entry((node_id.clone(), choice_id.clone()))
                .or_insert(0) += 1;
            distinct.insert(node_id.as_str());
        }
        *self.node_counts.entry(terminal_id.to_string()).or_insert(0) += 1;
        distinct.insert(terminal_id);
        for node_id in &distinct {
            *self
                .node_path_counts
                .entry((*node_id).to_string())
                .or_insert(0) += 1;
        }

        let per_ending_visits = self
            .per_ending_node_counts
            .entry(terminal_id.to_string())
            .or_default();
        for (node_id, _) in steps {
            *per_ending_visits.entry(node_id.clone()).or_insert(0) += 1;
        }
        *per_ending_visits
            .entry(terminal_id.to_string())
            .or_insert(0) += 1;
        let per_ending_reach = self
            .per_ending_path_counts
            .entry(terminal_id.to_string())
            .or_default();
        for node_id in &distinct {
            *per_ending_reach.entry((*node_id).to_string()).or_insert(0) += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::PathCounts;

    #[test]
    fn record_path_includes_terminal_in_node_traffic() {
        let mut counts = PathCounts::default();
        counts.record_path(&[("start".into(), "continue".into())], "ending");

        assert_eq!(counts.node_counts.get("ending"), Some(&1));
    }

    #[test]
    fn record_path_includes_terminal_in_distinct_reach() {
        let mut counts = PathCounts::default();
        counts.record_path(&[("start".into(), "continue".into())], "ending");

        assert_eq!(counts.node_path_counts.get("ending"), Some(&1));
    }
}

#[derive(Debug, Clone)]
pub struct SimAnalytics {
    /// Static: ending reachability score per node.
    pub node_importance: Vec<NodeImportance>,
    /// Dynamic: traversal counts from completed play paths.
    pub path_counts: PathCounts,
    /// Number of authored choices at each node (its branching factor). A node
    /// hit by many paths but with ≤1 choice is a linear bottleneck — a candidate
    /// to split into more options.
    pub node_out_degree: HashMap<String, usize>,
}
