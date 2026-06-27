use rustc_hash::FxHashMap as HashMap;
use std::fmt;
use std::sync::Arc;

use crate::content::MetaCatalog;
use crate::rng::DEFAULT_DIE_SIDES;

#[derive(Debug, Clone, Default)]
pub struct ResolvedAssetCatalog {
    pub music_cues: HashMap<String, Arc<MusicCue>>,
    pub sfx_cues: HashMap<String, Arc<SfxCue>>,
    pub texture_cues: HashMap<String, Arc<TextureCue>>,
}

use crate::content::{ChoiceAction, NodeMode, RollMode, TextBlock};
use crate::value::DynamicValue;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MusicCue {
    pub ref_id: String,
    pub src: String,
    pub r#loop: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SfxCue {
    pub ref_id: String,
    pub src: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextureCue {
    pub ref_id: String,
    pub src: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InventoryItemView {
    pub ref_id: String,
    pub name: String,
    pub count: u32,
    pub icon: Option<Arc<TextureCue>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ItemActionView {
    pub item_ref: String,
    pub action_id: String,
    pub label: String,
    pub enabled: bool,
    pub disabled_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CharacterView {
    pub ref_id: String,
    pub name: String,
    pub subtitle: Option<String>,
    pub portrait: Option<Arc<TextureCue>>,
    pub voice_ref: Option<String>,
    pub color: Option<String>,
    /// Relationship metrics declared on the character, with their current
    /// values. Ordered deterministically by metric key. Carries every declared
    /// metric (not just affinity/trust) so the host can surface the cold,
    /// clinical ones (submission, suspicion, mercy, guilt, ...) the same way.
    pub metrics: Vec<RelationshipMetricView>,
}

/// Characters whose relationship scores have diverged from scenario defaults
/// but who are not speaking on the current node. Carries live metrics and
/// display metadata only — no portrait or voice cues, because those assets are
/// chapter-scoped and may not be loaded until the character appears on screen.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RelationshipCharacterView {
    pub ref_id: String,
    pub name: String,
    pub subtitle: Option<String>,
    pub color: Option<String>,
    pub metrics: Vec<RelationshipMetricView>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RelationshipMetricView {
    pub key: String,
    pub value: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ItemExamineView {
    pub ref_id: String,
    pub name: String,
    pub description: String,
    pub examine_text: String,
    pub icon: Option<Arc<TextureCue>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckPreview {
    pub stat: String,
    pub difficulty: i32,
    pub label: Option<String>,
    pub sides: u32,
    pub roll_mode: RollMode,
    pub max_attempts: Option<u32>,
    pub attempts_used: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RollRecord {
    SkillCheck {
        label: Option<String>,
        stat: String,
        difficulty: i32,
        sides: Option<u32>,
        roll: i32,
        modifier: i32,
        total: i32,
        success: bool,
        roll_mode: RollMode,
    },
    Roll {
        label: Option<String>,
        sides: Option<u32>,
        roll: i32,
        modifier: i32,
        total: i32,
    },
    Random {
        label: Option<String>,
        sides: Option<u32>,
        roll: i32,
        modifier: i32,
        total: i32,
    },
    Dice {
        label: Option<String>,
        sides: Option<u32>,
        roll: i32,
        modifier: i32,
        total: i32,
    },
}

impl RollRecord {
    pub fn is_skill_check_failure(&self) -> bool {
        matches!(self, RollRecord::SkillCheck { success: false, .. })
    }
}

impl fmt::Display for RollRecord {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RollRecord::SkillCheck {
                label,
                stat,
                difficulty,
                sides,
                roll,
                modifier,
                total,
                success,
                roll_mode,
            } => {
                let outcome = if *success { "success" } else { "failure" };
                let title = label.as_deref().unwrap_or(stat);
                let mode = match roll_mode {
                    RollMode::Normal => "",
                    RollMode::Advantage => " (adv)",
                    RollMode::Disadvantage => " (dis)",
                };
                write!(
                    f,
                    "skill check {title}{mode}: d{}={roll} + {modifier} = {total} vs DC {difficulty} ({outcome})",
                    sides.unwrap_or(DEFAULT_DIE_SIDES)
                )
            }
            RollRecord::Roll { label, total, .. } => {
                let title = label.as_deref().unwrap_or("roll");
                write!(f, "{title}: {total}")
            }
            RollRecord::Random { label, total, .. } => {
                let title = label.as_deref().unwrap_or("random");
                write!(f, "{title}: {total}")
            }
            RollRecord::Dice { label, total, .. } => {
                let title = label.as_deref().unwrap_or("dice");
                write!(f, "{title}: {total}")
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct GameView {
    pub scenario_title: Option<String>,
    pub chapter_id: Option<String>,
    pub chapter_title: Option<String>,
    pub node_id: String,
    pub title: Option<String>,
    pub mode: NodeMode,
    pub text: Vec<TextBlock>,
    pub choices: Vec<ChoiceView>,
    pub music: Option<Arc<MusicCue>>,
    pub background: Option<Arc<TextureCue>>,
    pub inventory_items: Vec<InventoryItemView>,
    pub item_actions: Vec<ItemActionView>,
    pub characters: Vec<CharacterView>,
    pub relationships: Vec<RelationshipCharacterView>,
    pub player_stats: HashMap<String, i32>,
    pub inventory: HashMap<String, u32>,
    pub flags: HashMap<String, DynamicValue>,
    pub events: Vec<String>,
    /// Static metadata for events and flags. Set once from GameContent; never changes during play.
    pub meta: Arc<MetaCatalog>,
}

#[derive(Debug, Clone)]
pub struct ChoiceView {
    pub id: String,
    pub label: String,
    pub enabled: bool,
    pub disabled_reason: Option<String>,
    pub check: Option<CheckPreview>,
    pub action: Option<ChoiceAction>,
    pub sfx: Option<Arc<SfxCue>>,
}
