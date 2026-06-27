use rustc_hash::FxHashMap as HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use blackbox_engine::content::default_player_stats;
use blackbox_engine::state::default_random_seed;

/// Default die sides used when the wire omits `sides` on a `roll` effect.
/// Mirrors `blackbox::rng::DEFAULT_DIE_SIDES` (d20).
const DEFAULT_DIE_SIDES: u32 = 20;

/// Shared contract for all top-level content documents (scenario, items, characters,
/// assets, chapters, catalog). Enables a single validated encode/decode pipeline.
pub(crate) trait DocumentWire {
    fn document_spec(&self) -> &str;
    fn document_format_version(&self) -> u32;
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub(crate) struct AssetCatalogWire {
    pub spec: String,
    #[serde(rename = "formatVersion")]
    pub format_version: u32,
    #[serde(default)]
    pub music: HashMap<String, MusicTrackWire>,
    #[serde(default)]
    pub sfx: HashMap<String, SfxClipWire>,
    #[serde(default)]
    pub textures: HashMap<String, TextureAssetWire>,
    #[serde(default, rename = "defaultChoiceSfx")]
    pub default_choice_sfx: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum AssetUsageWire {
    #[default]
    Internal,
    External,
}

fn is_internal_asset_usage(usage: &AssetUsageWire) -> bool {
    *usage == AssetUsageWire::Internal
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct TextureAssetWire {
    pub src: String,
    #[serde(default, skip_serializing_if = "is_internal_asset_usage")]
    pub usage: AssetUsageWire,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub(crate) struct CharacterCatalogWire {
    pub spec: String,
    #[serde(rename = "formatVersion")]
    pub format_version: u32,
    #[serde(default)]
    pub characters: HashMap<String, CharacterDefinitionWire>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct CharacterDefinitionWire {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub subtitle: Option<String>,
    #[serde(default, rename = "portraitRef")]
    pub portrait_ref: Option<String>,
    #[serde(default, rename = "voiceRef")]
    pub voice_ref: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub relationships: RelationshipScoresWire,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(transparent)]
pub(crate) struct RelationshipScoresWire(pub HashMap<String, i32>);

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub(crate) struct ItemCatalogWire {
    pub spec: String,
    #[serde(rename = "formatVersion")]
    pub format_version: u32,
    #[serde(default)]
    pub items: HashMap<String, ItemDefinitionWire>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ItemDefinitionWire {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(default, rename = "examineText")]
    pub examine_text: Option<String>,
    #[serde(default, rename = "iconRef")]
    pub icon_ref: Option<String>,
    #[serde(default)]
    pub actions: Vec<ItemActionWire>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ItemActionWire {
    pub id: String,
    pub label: String,
    #[serde(
        default = "default_empty_gate",
        skip_serializing_if = "gate_wire_is_empty"
    )]
    pub requires: GateWire,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub when: Option<GateWire>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unless: Option<GateWire>,
    #[serde(default, rename = "disabledReason")]
    pub disabled_reason: Option<String>,
    #[serde(default, rename = "whenDisabledReason")]
    pub when_disabled_reason: Option<String>,
    #[serde(default, rename = "unlessDisabledReason")]
    pub unless_disabled_reason: Option<String>,
    #[serde(default)]
    pub effects: Vec<EffectWire>,
    pub goto: Option<String>,
    #[serde(default = "default_true")]
    pub consume: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct MusicTrackWire {
    pub src: String,
    #[serde(default = "default_true")]
    pub r#loop: bool,
    #[serde(default, skip_serializing_if = "is_internal_asset_usage")]
    pub usage: AssetUsageWire,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SfxClipWire {
    pub src: String,
    #[serde(default, skip_serializing_if = "is_internal_asset_usage")]
    pub usage: AssetUsageWire,
}

fn default_true() -> bool {
    true
}

fn default_game_over_mode() -> NodeModeWire {
    NodeModeWire::GameOver
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct GameContentWire {
    pub spec: String,
    #[serde(rename = "formatVersion")]
    pub format_version: u32,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default, rename = "startNodeId")]
    pub start_node_id: Option<String>,
    #[serde(default)]
    pub revision: Option<String>,
    #[serde(default = "default_player_stats", rename = "defaultStats")]
    pub default_stats: HashMap<String, i32>,
    #[serde(default, rename = "randomSeed")]
    pub random_seed: Option<u64>,
    #[serde(default, rename = "itemsRef")]
    pub items_ref: Option<String>,
    #[serde(default, rename = "charactersRef")]
    pub characters_ref: Option<String>,
    #[serde(default, rename = "relationshipOverrides")]
    pub relationship_overrides: HashMap<String, RelationshipScoresWire>,
    #[serde(default, rename = "assetsRef")]
    pub assets_ref: Option<String>,
    #[serde(default, rename = "catalogRef")]
    pub catalog_ref: Option<String>,
    #[serde(default, rename = "libraryRef")]
    pub library_ref: Option<String>,
    #[serde(default)]
    pub chapters: Vec<ChapterRefWire>,
    #[serde(default)]
    pub nodes: HashMap<String, NodeContentWire>,
    #[serde(default, rename = "deathNode")]
    pub death_node: Option<InlineNodeContentWire>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ChapterRefWire {
    pub id: String,
    pub title: String,
    #[serde(rename = "ref")]
    pub file_ref: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ChapterWire {
    pub spec: String,
    #[serde(rename = "formatVersion")]
    pub format_version: u32,
    pub id: String,
    pub title: String,
    #[serde(rename = "startNodeId")]
    pub start_node_id: String,
    #[serde(default, rename = "deathNodeId")]
    pub death_node_id: Option<String>,
    pub nodes: HashMap<String, NodeContentWire>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct LibraryWire {
    pub spec: String,
    #[serde(rename = "formatVersion")]
    pub format_version: u32,
    #[serde(default)]
    pub snippets: HashMap<String, TextBlockWire>,
    #[serde(default)]
    pub templates: HashMap<String, InlineNodeContentWire>,
    /// Named/derived conditions. Reference via `{ "type": "condition", "id": "<name>" }`.
    ///
    /// @compat: absent in library.json files authored before conditions were introduced.
    /// `serde(default)` keeps old files loading as an empty map.
    #[serde(default)]
    pub conditions: HashMap<String, GateWire>,
}

/// Controls how a field in a `$extends` node merges its array with the template's array.
/// Default is `replace` (non-empty overlay replaces template; empty overlay inherits).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ArrayMergeModeWire {
    /// Non-empty overlay replaces the template array; empty overlay inherits. (default)
    #[default]
    Replace,
    /// Overlay is appended after the template array (template entries come first).
    Append,
    /// Overlay is prepended before the template array (overlay entries come first).
    Prepend,
}

/// Per-array merge overrides for `$extends` nodes. Omitted fields default to `replace`.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub(crate) struct MergeConfigWire {
    #[serde(default)]
    pub text: ArrayMergeModeWire,
    #[serde(default, rename = "onEnter")]
    pub on_enter: ArrayMergeModeWire,
    #[serde(default)]
    pub choices: ArrayMergeModeWire,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct NodeContentWire {
    pub id: String,
    #[serde(default, rename = "$extends")]
    pub extends: Option<String>,
    /// Per-array merge behaviour when `$extends` is set.
    ///
    /// @compat: absent in nodes authored before `$merge` was introduced.
    /// `serde(default)` gives all arrays `replace` semantics, preserving the
    /// pre-existing behaviour for old content.
    #[serde(default, rename = "$merge")]
    pub merge: MergeConfigWire,
    pub title: Option<String>,
    #[serde(default, rename = "backgroundRef")]
    pub background_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<NodeModeWire>,
    #[serde(default)]
    pub text: Vec<TextEntryWire>,
    #[serde(default, rename = "onEnter")]
    pub on_enter: Vec<EffectWire>,
    #[serde(default)]
    pub choices: Vec<ChoiceContentWire>,
}

/// Inline node definition used in scenario.json `deathNode`. Has no `id` — the engine
/// assigns the synthetic id `"__death__"` and injects it into the loaded content.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct InlineNodeContentWire {
    #[serde(default, rename = "$extends")]
    pub extends: Option<String>,
    /// Per-array merge behaviour when `$extends` is set.
    ///
    /// @compat: absent in inline nodes authored before `$merge` was introduced.
    /// Defaults to `replace` for all arrays, preserving old behaviour.
    #[serde(default, rename = "$merge")]
    pub merge: MergeConfigWire,
    pub title: Option<String>,
    #[serde(default, rename = "backgroundRef")]
    pub background_ref: Option<String>,
    #[serde(default = "default_game_over_mode")]
    pub mode: NodeModeWire,
    #[serde(default)]
    pub text: Vec<TextEntryWire>,
    #[serde(default, rename = "onEnter")]
    pub on_enter: Vec<EffectWire>,
    #[serde(default)]
    pub choices: Vec<ChoiceContentWire>,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum NodeModeWire {
    #[default]
    Normal,
    GameOver,
    Ending,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum DialogueSideWire {
    #[default]
    Left,
    Right,
    Center,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct TextBlockWire {
    pub kind: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub r#else: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub when: Option<GateWire>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unless: Option<GateWire>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speaker: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub emotion: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub side: Option<DialogueSideWire>,
    /// When set, the block is only visible when this flag is truthy. Sugar for
    /// `when: { type: hasFlag, flag: <actor> }` — lets you mark a text block as
    /// belonging to a conditionally-present character without repeating the gate.
    ///
    /// @compat: absent in text blocks authored before `actor` was introduced.
    /// `None` means no implicit actor gate; block visibility is unaffected.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub(crate) enum TextEntryWire {
    SnippetString(String),
    SnippetRef {
        #[serde(rename = "$snippet")]
        snippet: String,
        /// Parameter values to substitute into `{param.KEY}` placeholders in the
        /// snippet text. Allows a single snippet to cover multiple variants.
        ///
        /// @compat: absent in snippet refs authored before parameterized snippets were
        /// introduced. `None` means no substitution — the snippet text is used verbatim.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        params: Option<HashMap<String, String>>,
    },
    Block(Box<TextBlockWire>),
}

impl TextEntryWire {
    pub(crate) fn normalize(self) -> Result<Self, String> {
        match self {
            TextEntryWire::SnippetString(value) => {
                let Some(id) = value.strip_prefix('@') else {
                    return Err(format!(
                        "text entry string '{value}' must be a snippet reference like '@snippet_id'"
                    ));
                };
                if id.is_empty() {
                    return Err("snippet reference must be '@id', not empty".to_string());
                }
                validate_snippet_id(id)?;
                Ok(TextEntryWire::SnippetRef {
                    snippet: id.to_string(),
                    params: None,
                })
            }
            TextEntryWire::SnippetRef { snippet, params } => {
                validate_snippet_id(&snippet)?;
                Ok(TextEntryWire::SnippetRef { snippet, params })
            }
            TextEntryWire::Block(block) => Ok(TextEntryWire::Block(block)),
        }
    }

    pub(crate) fn into_resolved(self) -> Result<ResolvedTextEntry, String> {
        match self.normalize()? {
            TextEntryWire::SnippetRef { snippet, params } => {
                Ok(ResolvedTextEntry::Snippet(snippet, params))
            }
            TextEntryWire::Block(block) => Ok(ResolvedTextEntry::Block(block)),
            TextEntryWire::SnippetString(_) => unreachable!("normalized above"),
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) enum ResolvedTextEntry {
    /// Snippet id and optional parameter substitutions for `{param.KEY}` placeholders.
    Snippet(String, Option<HashMap<String, String>>),
    Block(Box<TextBlockWire>),
}

fn validate_snippet_id(id: &str) -> Result<(), String> {
    let Some(first) = id.chars().next() else {
        return Err("snippet id must not be empty".to_string());
    };
    if !first.is_ascii_alphabetic() && first != '_' {
        return Err(format!(
            "snippet id '{id}' must start with a letter or underscore"
        ));
    }
    if !id.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_') {
        return Err(format!(
            "snippet id '{id}' may only contain letters, digits, and underscores"
        ));
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ChoicePresentationWire {
    pub id: String,
    pub label: String,
    pub sfx: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ChoiceGateWire {
    #[serde(
        default = "default_empty_gate",
        skip_serializing_if = "gate_wire_is_empty"
    )]
    pub requires: GateWire,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub when: Option<GateWire>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unless: Option<GateWire>,
    #[serde(default, rename = "disabledReason")]
    pub disabled_reason: Option<String>,
    #[serde(default, rename = "whenDisabledReason")]
    pub when_disabled_reason: Option<String>,
    #[serde(default, rename = "unlessDisabledReason")]
    pub unless_disabled_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ChoiceResolutionSpecWire {
    #[serde(default)]
    pub effects: Vec<EffectWire>,
    pub goto: Option<String>,
    #[serde(default)]
    pub check: Option<SkillCheckContentWire>,
    #[serde(default)]
    pub action: Option<ChoiceActionWire>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ChoiceContentWire {
    #[serde(flatten)]
    pub presentation: ChoicePresentationWire,
    #[serde(flatten)]
    pub gate: ChoiceGateWire,
    #[serde(flatten)]
    pub resolution: ChoiceResolutionSpecWire,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum RollModeWire {
    #[default]
    Normal,
    Advantage,
    Disadvantage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SkillCheckContentWire {
    pub stat: String,
    pub difficulty: i32,
    #[serde(default)]
    pub modifier: Option<ExprInputWire>,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default = "default_die_sides")]
    pub sides: u32,
    #[serde(default, rename = "rollMode")]
    pub roll_mode: RollModeWire,
    #[serde(default, rename = "maxAttempts")]
    pub max_attempts: Option<u32>,
    #[serde(rename = "onSuccess")]
    pub on_success: SkillCheckOutcomeWire,
    #[serde(rename = "onFailure")]
    pub on_failure: SkillCheckOutcomeWire,
    #[serde(default, rename = "onExhausted")]
    pub on_exhausted: Option<SkillCheckOutcomeWire>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SkillCheckOutcomeWire {
    #[serde(default)]
    pub effects: Vec<EffectWire>,
    pub goto: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum ChoiceActionWire {
    RestartGame {
        #[serde(rename = "startNodeId")]
        start_node_id: String,
    },
    OpenLoadMenu,
    OpenMainMenu,
    GotoChapter {
        #[serde(rename = "chapterId")]
        chapter_id: String,
        #[serde(default, rename = "nodeId")]
        node_id: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub(crate) enum GateWire {
    /// Top-level JSON array is AND.
    All(Vec<GateWire>),
    One(GateNodeWire),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum GateNodeWire {
    HasItem {
        #[serde(rename = "itemId")]
        item_id: String,
        #[serde(default = "default_count")]
        count: u32,
        #[serde(
            default,
            rename = "disabledReason",
            skip_serializing_if = "Option::is_none"
        )]
        disabled_reason: Option<String>,
    },
    HasFlag {
        flag: String,
        #[serde(default)]
        value: Option<JsonValue>,
        #[serde(
            default,
            rename = "disabledReason",
            skip_serializing_if = "Option::is_none"
        )]
        disabled_reason: Option<String>,
    },
    StatGte {
        stat: String,
        value: i32,
        #[serde(
            default,
            rename = "disabledReason",
            skip_serializing_if = "Option::is_none"
        )]
        disabled_reason: Option<String>,
    },
    StatLte {
        stat: String,
        value: i32,
        #[serde(
            default,
            rename = "disabledReason",
            skip_serializing_if = "Option::is_none"
        )]
        disabled_reason: Option<String>,
    },
    StatEq {
        stat: String,
        value: i32,
        #[serde(
            default,
            rename = "disabledReason",
            skip_serializing_if = "Option::is_none"
        )]
        disabled_reason: Option<String>,
    },
    Visited {
        #[serde(rename = "nodeId")]
        node_id: String,
        #[serde(
            default,
            rename = "disabledReason",
            skip_serializing_if = "Option::is_none"
        )]
        disabled_reason: Option<String>,
    },
    AtNode {
        #[serde(rename = "nodeId")]
        node_id: String,
        #[serde(
            default,
            rename = "disabledReason",
            skip_serializing_if = "Option::is_none"
        )]
        disabled_reason: Option<String>,
    },
    RelationshipGte {
        #[serde(rename = "characterId")]
        character_id: String,
        metric: String,
        value: i32,
        #[serde(
            default,
            rename = "disabledReason",
            skip_serializing_if = "Option::is_none"
        )]
        disabled_reason: Option<String>,
    },
    RelationshipLte {
        #[serde(rename = "characterId")]
        character_id: String,
        metric: String,
        value: i32,
        #[serde(
            default,
            rename = "disabledReason",
            skip_serializing_if = "Option::is_none"
        )]
        disabled_reason: Option<String>,
    },
    RelationshipEq {
        #[serde(rename = "characterId")]
        character_id: String,
        metric: String,
        value: i32,
        #[serde(
            default,
            rename = "disabledReason",
            skip_serializing_if = "Option::is_none"
        )]
        disabled_reason: Option<String>,
    },
    All {
        conditions: Vec<GateWire>,
    },
    Any {
        conditions: Vec<GateWire>,
    },
    Not {
        condition: Box<GateWire>,
    },
    /// Reference to a named condition defined in the library `conditions` section.
    #[serde(rename = "condition")]
    ConditionRef {
        id: String,
        #[serde(
            default,
            rename = "disabledReason",
            skip_serializing_if = "Option::is_none"
        )]
        disabled_reason: Option<String>,
    },
    /// First-class actor presence: passes when the character is currently active in the scene.
    /// Compiles to `hasFlag("_actor_<characterId>", true)`.
    #[serde(rename = "actorPresent")]
    ActorPresent {
        #[serde(rename = "characterId")]
        character_id: String,
        #[serde(
            default,
            rename = "disabledReason",
            skip_serializing_if = "Option::is_none"
        )]
        disabled_reason: Option<String>,
    },
}

fn default_count() -> u32 {
    1
}

fn default_empty_gate() -> GateWire {
    GateWire::All(vec![])
}

fn gate_wire_is_empty(gate: &GateWire) -> bool {
    matches!(gate, GateWire::All(items) if items.is_empty())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub(crate) enum EffectWire {
    #[serde(rename = "setFlag")]
    SetFlag {
        flag: String,
        #[serde(default)]
        value: Option<JsonValue>,
        #[serde(default, rename = "valueExpr")]
        value_expr: Option<ExprInputWire>,
    },

    #[serde(rename = "modifyStat")]
    ModifyStat {
        stat: String,
        #[serde(default)]
        amount: Option<i32>,
        #[serde(default, rename = "amountExpr")]
        amount_expr: Option<ExprInputWire>,
    },

    #[serde(rename = "addItem")]
    AddItem {
        #[serde(rename = "itemId")]
        item_id: String,
        #[serde(default)]
        count: Option<u32>,
        #[serde(default, rename = "countExpr")]
        count_expr: Option<ExprInputWire>,
    },

    #[serde(rename = "removeItem")]
    RemoveItem {
        #[serde(rename = "itemId")]
        item_id: String,
        #[serde(default)]
        count: Option<u32>,
        #[serde(default, rename = "countExpr")]
        count_expr: Option<ExprInputWire>,
    },

    #[serde(rename = "addEvent")]
    AddEvent {
        #[serde(rename = "eventId")]
        event_id: String,
    },

    #[serde(rename = "playMusic")]
    PlayMusic { track: String },

    #[serde(rename = "stopMusic")]
    StopMusic,

    #[serde(rename = "playSfx")]
    PlaySfx { sfx: String },

    #[serde(rename = "roll")]
    Roll {
        #[serde(default = "default_die_sides")]
        sides: u32,
        #[serde(default)]
        label: Option<String>,
        #[serde(default, rename = "storeFlag")]
        store_flag: Option<String>,
    },

    #[serde(rename = "modifyRelationship")]
    ModifyRelationship {
        #[serde(rename = "characterId")]
        character_id: String,
        metric: String,
        #[serde(default)]
        amount: Option<i32>,
        #[serde(default, rename = "amountExpr")]
        amount_expr: Option<ExprInputWire>,
    },

    /// Mark a character as present (`value: true`) or absent (`value: false`) in the scene.
    /// Writes `_actor_<characterId>` into `GameState.flags` — identical to the `actor` field sugar
    /// on text blocks, but available as an explicit effect for `onEnter` or choice effects.
    #[serde(rename = "setActorPresent")]
    SetActorPresent {
        #[serde(rename = "characterId")]
        character_id: String,
        value: bool,
    },
}

fn default_die_sides() -> u32 {
    DEFAULT_DIE_SIDES
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub(crate) enum ExprValueWire {
    Number(i32),
    Bool(bool),
    String(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub(crate) enum ExprWire {
    Lit(ExprValueWire),
    Var {
        var: String,
    },
    Call {
        call: String,
        args: Vec<ExprWire>,
    },
    Op {
        op: String,
        left: Box<ExprWire>,
        #[serde(default)]
        right: Option<Box<ExprWire>>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub(crate) enum ExprInputWire {
    String(String),
    Expr(ExprWire),
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub(crate) struct MetaCatalogWire {
    pub spec: String,
    #[serde(rename = "formatVersion")]
    pub format_version: u32,
    #[serde(default)]
    pub events: HashMap<String, CatalogEntryWire>,
    #[serde(default)]
    pub flags: HashMap<String, CatalogEntryWire>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub(crate) struct CatalogEntryWire {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub internal: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct GameStateWire {
    pub current_node_id: String,
    #[serde(default)]
    pub revision: Option<String>,
    pub player: PlayerStateWire,
    pub inventory: InventoryStateWire,
    pub flags: HashMap<String, JsonValue>,
    #[serde(default)]
    pub relationships: HashMap<String, RelationshipScoresWire>,
    pub events: Vec<String>,
    pub visited_nodes: Vec<String>,
    #[serde(default)]
    pub ambient_music: Option<String>,
    #[serde(default, rename = "ambientBackground")]
    pub ambient_background: Option<String>,
    #[serde(default = "default_random_seed", rename = "randomSeed")]
    pub random_seed: u64,
    #[serde(default, rename = "randomCounter")]
    pub random_counter: u64,
    /// Per-choice attempt counters for `maxAttempts` skill checks.
    /// Keys are `"{node_id}:{choice_id}"`. Omitted from wire when empty.
    #[serde(
        default,
        rename = "choiceAttempts",
        skip_serializing_if = "HashMap::is_empty"
    )]
    pub choice_attempts: HashMap<String, u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct PlayerStateWire {
    pub stats: HashMap<String, i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct InventoryStateWire {
    pub items: HashMap<String, u32>,
}

macro_rules! impl_document_wire {
    ($t:ty) => {
        impl DocumentWire for $t {
            fn document_spec(&self) -> &str {
                &self.spec
            }
            fn document_format_version(&self) -> u32 {
                self.format_version
            }
        }
    };
}

impl_document_wire!(GameContentWire);
impl_document_wire!(ItemCatalogWire);
impl_document_wire!(CharacterCatalogWire);
impl_document_wire!(AssetCatalogWire);
impl_document_wire!(ChapterWire);
impl_document_wire!(MetaCatalogWire);
impl_document_wire!(LibraryWire);
