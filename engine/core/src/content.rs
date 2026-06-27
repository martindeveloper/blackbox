use rustc_hash::FxHashMap as HashMap;
use std::sync::Arc;

use serde::Serialize;

use crate::expr::{Expr, ExprInput};
use crate::gate::Gate;
use crate::relationship::RelationshipScores;
use crate::value::DynamicValue;
use crate::view::ResolvedAssetCatalog;

mod library;
pub use library::{PreparedLibrary, TemplateBody};

#[derive(Debug, Clone, Default)]
pub struct AssetCatalog {
    pub music: HashMap<String, MusicTrack>,
    pub sfx: HashMap<String, SfxClip>,
    pub textures: HashMap<String, TextureAsset>,
    /// Plays when a choice is selected unless the choice specifies its own `sfx`.
    pub default_choice_sfx: Option<String>,
    /// Pre-resolved cues for cheap runtime lookup (built during validation).
    pub resolved: ResolvedAssetCatalog,
}

#[derive(Debug, Clone, Default)]
pub struct CharacterCatalog {
    pub characters: HashMap<String, CharacterDefinition>,
}

impl CharacterCatalog {
    pub fn get(&self, id: &str) -> Option<&CharacterDefinition> {
        self.characters.get(id)
    }
}

#[derive(Debug, Clone)]
pub struct CharacterDefinition {
    pub id: String,
    pub name: String,
    pub subtitle: Option<String>,
    pub portrait_ref: Option<String>,
    pub voice_ref: Option<String>,
    pub color: Option<String>,
    pub relationships: RelationshipScores,
}

#[derive(Debug, Clone, Default)]
pub struct ItemCatalog {
    pub items: HashMap<String, ItemDefinition>,
}

impl ItemCatalog {
    pub fn get(&self, id: &str) -> Option<&ItemDefinition> {
        self.items.get(id)
    }
}

#[derive(Debug, Clone)]
pub struct ItemDefinition {
    pub id: String,
    pub name: String,
    pub description: String,
    pub examine_text: Option<String>,
    pub icon_ref: Option<String>,
    pub actions: Vec<ItemAction>,
}

#[derive(Debug, Clone)]
pub struct ItemAction {
    pub id: String,
    pub label: String,
    pub gate: ChoiceGate,
    pub effects: Vec<Effect>,
    pub goto: Option<String>,
    /// When true (default), one item is removed after the action resolves.
    pub consume: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AssetUsage {
    #[default]
    Internal,
    /// Referenced outside scenario content (e.g. shell UI); skip unused-asset lint.
    External,
}

#[derive(Debug, Clone)]
pub struct MusicTrack {
    pub src: String,
    pub r#loop: bool,
    pub usage: AssetUsage,
}

#[derive(Debug, Clone)]
pub struct SfxClip {
    pub src: String,
    pub usage: AssetUsage,
}

#[derive(Debug, Clone)]
pub struct TextureAsset {
    pub src: String,
    pub usage: AssetUsage,
}

pub fn default_player_stats() -> HashMap<String, i32> {
    HashMap::from_iter([
        ("hp".to_string(), 10),
        ("max_hp".to_string(), 10),
        ("empathy".to_string(), 3),
        ("logic".to_string(), 3),
        ("violence".to_string(), 1),
    ])
}

#[derive(Debug, Clone)]
pub struct ChapterMeta {
    pub id: String,
    pub title: String,
    pub start_node_id: String,
    /// Overrides scenario `deathNode` fallback when the player dies in this chapter.
    pub death_node_id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct CatalogEntry {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub internal: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct MetaCatalog {
    pub events: HashMap<String, CatalogEntry>,
    pub flags: HashMap<String, CatalogEntry>,
}

#[derive(Debug, Clone)]
pub struct GameContent {
    pub title: Option<String>,
    pub start_node_id: String,
    pub chapters: Vec<ChapterMeta>,
    pub node_chapter: HashMap<String, String>,
    /// Optional revision tag, e.g. "3.0". Written into every save so stale saves
    /// can be detected when the scenario changes.
    pub revision: Option<String>,
    pub default_stats: HashMap<String, i32>,
    pub random_seed: Option<u64>,
    pub items: ItemCatalog,
    pub characters: CharacterCatalog,
    pub default_relationships: HashMap<String, RelationshipScores>,
    pub assets: AssetCatalog,
    pub nodes: HashMap<String, NodeContent>,
    /// When player HP reaches 0, the engine navigates here (must be a `game_over` node).
    pub death_node_id: Option<String>,
    /// Metadata catalog for flags and events. Shared cheaply via Arc.
    pub meta: Arc<MetaCatalog>,
    /// Raw library document bytes (JSON in dev, msgpack from bundle). Cleared prepared
    /// library when replaced via `load_library_source`.
    pub library_source: Option<Vec<u8>>,
    /// Prepared library kept in memory for chapter merge (snippets/templates resolved).
    pub prepared_library: Option<PreparedLibrary>,
}

#[derive(Debug, Clone)]
pub struct NodeContent {
    pub id: String,
    pub title: Option<String>,
    pub background_ref: Option<String>,
    pub mode: NodeMode,
    pub text: Vec<TextBlock>,
    /// Effects run when the player arrives at this node (new game, goto, restart).
    /// Not re-run on save restore.
    pub on_enter: Vec<Effect>,
    pub choices: Vec<ChoiceContent>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum NodeMode {
    #[default]
    Normal,
    /// Failure, death, or other negative conclusion (vitals redirect target).
    GameOver,
    /// Positive story conclusion.
    Ending,
}

impl NodeMode {
    pub fn is_terminal(&self) -> bool {
        matches!(self, NodeMode::GameOver | NodeMode::Ending)
    }
}

/// Horizontal placement for dialogue lines in visual-novel style hosts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DialogueSide {
    Left,
    Right,
    Center,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TextSegment {
    Literal(String),
    Expr(Expr),
}

/// A narrative line in scenario content. Resolved at view time: `when` filters
/// visibility, `{expr}` segments in `text` are interpolated from game state.
///
/// Common `kind` values: `paragraph`, `dialogue`, `thought`, `stage_direction`.
#[derive(Debug, Clone)]
pub struct TextBlock {
    pub kind: String,
    pub text: String,
    /// Shown when `when`/`unless` fails; omitted blocks are skipped entirely.
    pub else_text: Option<String>,
    pub when: Option<Gate>,
    /// Block is hidden when this passes.
    pub unless: Option<Gate>,
    pub compiled_when: Option<Expr>,
    pub compiled_unless: Option<Expr>,
    pub compiled_text: Vec<TextSegment>,
    pub compiled_else_text: Vec<TextSegment>,
    pub speaker: Option<String>,
    /// Optional mood tag for host styling, e.g. `cold`, `urgent`.
    pub emotion: Option<String>,
    pub side: Option<DialogueSide>,
    /// When set, the block is only visible when this flag is truthy. Shorthand for
    /// adding `when: { type: hasFlag, flag: <actor> }` to every line of an actor
    /// that is conditionally present in a scene. Compiled into `compiled_when` at load.
    pub actor: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ChoicePresentation {
    pub id: String,
    pub label: String,
    pub sfx: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ChoiceGate {
    pub requires: Option<Gate>,
    pub when: Option<Gate>,
    /// Choice is disabled when this passes.
    pub unless: Option<Gate>,
    /// Fallback when a leaf `requires` condition fails without its own reason.
    ///
    /// Also read for lone `when`/`unless` gates via [`obsolete!`] compat in
    /// `choice_gate` — prefer `when_disabled_reason` / `unless_disabled_reason`.
    pub disabled_reason: Option<String>,
    /// When set, a failing `when` gate shows the choice disabled instead of hidden.
    pub when_disabled_reason: Option<String>,
    /// When set, a passing `unless` gate shows the choice disabled instead of hidden.
    pub unless_disabled_reason: Option<String>,
    pub compiled_requires: Option<Expr>,
    pub compiled_when: Option<Expr>,
    pub compiled_unless: Option<Expr>,
}

#[derive(Debug, Clone)]
pub struct ChoiceResolutionSpec {
    pub effects: Vec<Effect>,
    pub goto: Option<String>,
    pub check: Option<SkillCheckContent>,
    pub action: Option<ChoiceAction>,
}

#[derive(Debug, Clone)]
pub struct ChoiceContent {
    pub presentation: ChoicePresentation,
    pub gate: ChoiceGate,
    pub resolution: ChoiceResolutionSpec,
}

/// Whether a skill check rolls one die (normal) or two dice taking the best or worst.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum RollMode {
    /// Roll once — the standard path.
    #[default]
    Normal,
    /// Roll twice, keep the higher result.
    Advantage,
    /// Roll twice, keep the lower result.
    Disadvantage,
}

#[derive(Debug, Clone)]
pub struct SkillCheckContent {
    pub stat: String,
    pub difficulty: i32,
    pub modifier: Option<ExprInput>,
    pub label: Option<String>,
    pub sides: u32,
    /// How many dice are rolled (one vs two with keep-best / keep-worst).
    pub roll_mode: RollMode,
    /// When set, tracks per-choice attempt counts in state. After this many
    /// attempts the `on_exhausted` branch fires instead of re-rolling.
    pub max_attempts: Option<u32>,
    pub on_success: SkillCheckOutcome,
    pub on_failure: SkillCheckOutcome,
    /// Fired when `max_attempts` is exhausted. Must be `Some` whenever
    /// `max_attempts` is `Some` (enforced by validation).
    pub on_exhausted: Option<SkillCheckOutcome>,
    pub compiled_modifier: Option<Expr>,
}

#[derive(Debug, Clone)]
pub struct SkillCheckOutcome {
    pub effects: Vec<Effect>,
    pub goto: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChoiceAction {
    RestartGame {
        start_node_id: String,
    },
    OpenLoadMenu,
    OpenMainMenu,
    GotoChapter {
        chapter_id: String,
        node_id: Option<String>,
    },
}

#[derive(Debug, Clone)]
pub enum Effect {
    SetFlag {
        flag: String,
        value: Option<DynamicValue>,
        value_expr: Option<ExprInput>,
        compiled_value_expr: Option<Expr>,
    },

    ModifyStat {
        stat: String,
        amount: Option<i32>,
        amount_expr: Option<ExprInput>,
        compiled_amount_expr: Option<Expr>,
    },

    AddItem {
        item_id: String,
        count: Option<u32>,
        count_expr: Option<ExprInput>,
        compiled_count_expr: Option<Expr>,
    },

    RemoveItem {
        item_id: String,
        count: Option<u32>,
        count_expr: Option<ExprInput>,
        compiled_count_expr: Option<Expr>,
    },

    AddEvent {
        event_id: String,
    },

    /// Persists across nodes until `stopMusic` or another `playMusic`.
    PlayMusic {
        track: String,
    },

    StopMusic,

    /// One-shot SFX cue; hosts play `CommandResult::triggered_sfx` after submission.
    PlaySfx {
        sfx: String,
    },

    Roll {
        sides: u32,
        label: Option<String>,
        store_flag: Option<String>,
    },

    ModifyRelationship {
        character_id: String,
        metric: String,
        amount: Option<i32>,
        amount_expr: Option<ExprInput>,
        compiled_amount_expr: Option<Expr>,
    },

    /// Mark a character as present (`value: true`) or absent (`value: false`) in the scene.
    /// Writes the reserved `_actor_<character_id>` flag; validated to reference a known character.
    SetActorPresent {
        character_id: String,
        value: bool,
    },
}
