use std::sync::Arc;

use crate::error::EngineError;
use crate::view::{GameView, ItemExamineView, RollRecord, SfxCue};

#[derive(Debug, Clone)]
pub enum PlayerCommand {
    Choose {
        choice_id: String,
    },
    Continue,
    Examine {
        item_ref: String,
    },
    UseItem {
        item_ref: String,
        action_id: Option<String>,
    },
}

#[derive(Debug, Clone)]
pub struct CommandResult {
    pub ok: bool,
    pub view: Option<GameView>,
    pub error: Option<EngineError>,
    pub selected_sfx: Option<Arc<SfxCue>>,
    pub triggered_sfx: Option<Arc<SfxCue>>,
    pub rolls: Vec<RollRecord>,
    pub examine: Option<ItemExamineView>,
    pub chapter_changed: bool,
}

impl CommandResult {
    pub fn success(
        view: GameView,
        selected_sfx: Option<Arc<SfxCue>>,
        rolls: Vec<RollRecord>,
    ) -> Self {
        Self::success_with_examine(view, selected_sfx, rolls, None)
    }

    pub fn success_with_examine(
        view: GameView,
        selected_sfx: Option<Arc<SfxCue>>,
        rolls: Vec<RollRecord>,
        examine: Option<ItemExamineView>,
    ) -> Self {
        Self::success_with_transition(view, selected_sfx, rolls, examine, false, None)
    }

    pub fn success_with_transition(
        view: GameView,
        selected_sfx: Option<Arc<SfxCue>>,
        rolls: Vec<RollRecord>,
        examine: Option<ItemExamineView>,
        chapter_changed: bool,
        triggered_sfx: Option<Arc<SfxCue>>,
    ) -> Self {
        Self {
            ok: true,
            view: Some(view),
            error: None,
            selected_sfx,
            triggered_sfx,
            rolls,
            examine,
            chapter_changed,
        }
    }

    pub fn failure(error: EngineError) -> Self {
        Self {
            ok: false,
            view: None,
            error: Some(error),
            selected_sfx: None,
            triggered_sfx: None,
            rolls: Vec::new(),
            examine: None,
            chapter_changed: false,
        }
    }
}
