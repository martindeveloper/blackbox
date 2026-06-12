use std::collections::HashSet;

use blackbox::GameContent;

pub struct CoverageTracker {
    pub all_nodes: HashSet<String>,
    pub all_choices: HashSet<(String, String)>,
    pub visited_nodes: HashSet<String>,
    pub visited_choices: HashSet<(String, String)>,
}

impl CoverageTracker {
    pub fn from_content(content: &GameContent) -> Self {
        let all_nodes: HashSet<String> = content.nodes.keys().cloned().collect();
        let all_choices: HashSet<(String, String)> = content
            .nodes
            .iter()
            .flat_map(|(node_id, node)| {
                node.choices
                    .iter()
                    .map(|c| (node_id.clone(), c.presentation.id.clone()))
            })
            .collect();
        Self {
            all_nodes,
            all_choices,
            visited_nodes: HashSet::new(),
            visited_choices: HashSet::new(),
        }
    }

    pub fn unvisited_nodes(&self) -> Vec<&str> {
        let mut nodes: Vec<&str> = self
            .all_nodes
            .iter()
            .filter(|n| !self.visited_nodes.contains(*n))
            .map(String::as_str)
            .collect();
        nodes.sort_unstable();
        nodes
    }

    pub fn unvisited_choices(&self) -> Vec<(&str, &str)> {
        let mut choices: Vec<(&str, &str)> = self
            .all_choices
            .iter()
            .filter(|c| !self.visited_choices.contains(*c))
            .map(|(n, c)| (n.as_str(), c.as_str()))
            .collect();
        choices.sort_unstable();
        choices
    }
}
