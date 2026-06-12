use crate::content::{ChoiceAction, ChoiceContent, SkillCheckOutcome};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChoiceResolution {
    Restart {
        start_node_id: String,
    },
    Goto {
        node_id: String,
    },
    GotoChapter {
        chapter_id: String,
        node_id: Option<String>,
    },
    Stay,
}

impl ChoiceContent {
    pub fn transition(&self) -> ChoiceResolution {
        match &self.resolution.action {
            Some(ChoiceAction::RestartGame { start_node_id }) => ChoiceResolution::Restart {
                start_node_id: start_node_id.clone(),
            },
            Some(ChoiceAction::OpenLoadMenu) => match &self.resolution.goto {
                Some(node_id) => ChoiceResolution::Goto {
                    node_id: node_id.clone(),
                },
                None => ChoiceResolution::Stay,
            },
            Some(ChoiceAction::OpenMainMenu) => ChoiceResolution::Stay,
            Some(ChoiceAction::GotoChapter {
                chapter_id,
                node_id,
            }) => ChoiceResolution::GotoChapter {
                chapter_id: chapter_id.clone(),
                node_id: node_id.clone(),
            },
            None => match &self.resolution.goto {
                Some(node_id) => ChoiceResolution::Goto {
                    node_id: node_id.clone(),
                },
                None => ChoiceResolution::Stay,
            },
        }
    }
}

impl SkillCheckOutcome {
    pub fn resolution(&self) -> ChoiceResolution {
        match &self.goto {
            Some(node_id) => ChoiceResolution::Goto {
                node_id: node_id.clone(),
            },
            None => ChoiceResolution::Stay,
        }
    }
}
