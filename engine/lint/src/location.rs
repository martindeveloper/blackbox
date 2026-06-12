use std::collections::HashMap;
use std::path::Path;

use blackbox::content::GameContent;
use blackbox_format::parse_scenario_manifest;

/// Maps node ids to the chapter JSON file that defines them.
pub struct NodeLocationIndex {
    scenario_file: String,
    chapter_files: HashMap<String, String>,
}

impl NodeLocationIndex {
    pub fn new(scenario_path: &Path) -> Self {
        let scenario_file = scenario_path.display().to_string();
        let mut chapter_files = HashMap::new();

        if let Ok(bytes) = std::fs::read(scenario_path)
            && let Ok(manifest) = parse_scenario_manifest(&bytes)
            && let Some(parent) = scenario_path.parent()
        {
            for chapter in manifest.chapters {
                chapter_files.insert(
                    chapter.id,
                    parent.join(&chapter.file_name).display().to_string(),
                );
            }
        }

        Self {
            scenario_file,
            chapter_files,
        }
    }

    pub fn chapter_file_for_node(&self, content: &GameContent, node_id: &str) -> Option<String> {
        if let Some(chapter_id) = content.node_chapter.get(node_id) {
            return self.chapter_files.get(chapter_id).cloned();
        }

        if content.nodes.contains_key(node_id) {
            return Some(self.scenario_file.clone());
        }

        None
    }
}

/// Parse `{file} node '{node_id}' …` contexts emitted by source-phase walkers.
pub fn parse_node_location(context: &str) -> (Option<String>, Option<String>) {
    let marker = " node '";
    let Some(start) = context.find(marker) else {
        return (None, None);
    };

    let file = context[..start].trim();
    let rest = &context[start + marker.len()..];
    let Some(end) = rest.find('\'') else {
        return (None, None);
    };
    let node_id = rest[..end].to_string();

    let chapter_file = if file.is_empty() {
        None
    } else {
        Some(file.to_string())
    };

    (chapter_file, Some(node_id))
}

/// Pull a node id from common lint message shapes (`node '…'`, `in node '…'`).
pub fn extract_node_id_from_message(message: &str) -> Option<String> {
    let mut last = None;
    let mut search_from = 0;

    while let Some(rel) = message[search_from..].find("node '") {
        let start = search_from + rel + "node '".len();
        let rest = &message[start..];
        if let Some(end) = rest.find('\'') {
            last = Some(rest[..end].to_string());
            search_from = start + end + 1;
        } else {
            break;
        }
    }

    last
}
