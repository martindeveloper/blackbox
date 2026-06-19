export const SCENARIO_SPEC = "com.blackbox.scenario";
export const CHAPTER_SPEC = "com.blackbox.chapter";
export const ASSETS_BUNDLE_SPEC = "com.blackbox.assets.bundle";
export const ITEMS_SPEC = "com.blackbox.items";
export const CHARACTERS_SPEC = "com.blackbox.characters";
export const CATALOG_SPEC = "com.blackbox.catalog";
export const LIBRARY_SPEC = "com.blackbox.library";
export const SUPPORTED_FORMAT_VERSION = 1;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type NodeMode = "normal" | "game_over" | "ending";
export type DialogueSide = "left" | "right" | "center";

export type RelationshipScores = Record<string, number>;

export interface ChapterRef {
  id: string;
  title: string;
  ref: string;
}

export interface PlatformSigningConfig {
  teamId?: string;
  method?: string;
  certificate?: string;
  provisioningProfile?: string;
  codeSignIdentity?: string;
}

export interface PlatformKeystoreConfig {
  path?: string;
  storePasswordEnv?: string;
  keyAlias?: string;
  keyPasswordEnv?: string;
}

export interface PlatformOrientations {
  iphone?: string[];
  ipad?: string[];
  phone?: string[];
}

export interface WebPlatformConfig {
  appName?: string;
  displayName?: string;
  outputName?: string;
  icon?: string;
  version?: string;
  backgroundColor?: string;
}

export interface IosPlatformConfig {
  bundleId?: string;
  appName?: string;
  displayName?: string;
  version?: string;
  buildNumber?: string;
  versionCode?: string;
  category?: string;
  orientations?: PlatformOrientations;
  icon?: string;
  backgroundColor?: string;
  safeAreaColor?: string;
  /**
   * Safe-area strategy on native builds. "band" (default): inset whole UI below
   * system bars. "bleed": header runs full-bleed under the status bar. "none": no inset.
   */
  safeAreaMode?: "band" | "bleed" | "none";
  signing?: PlatformSigningConfig;
}

export interface AndroidPlatformConfig {
  applicationId?: string;
  bundleId?: string;
  appName?: string;
  displayName?: string;
  version?: string;
  versionCode?: number;
  buildNumber?: string;
  orientations?: PlatformOrientations;
  icon?: string;
  backgroundColor?: string;
  safeAreaColor?: string;
  /**
   * Safe-area strategy on native builds. "band" (default): inset whole UI below
   * system bars. "bleed": header runs full-bleed under the status bar. "none": no inset.
   */
  safeAreaMode?: "band" | "bleed" | "none";
  keystore?: PlatformKeystoreConfig;
}

export interface ScenarioPlatforms {
  web?: WebPlatformConfig;
  ios?: IosPlatformConfig;
  android?: AndroidPlatformConfig;
}

export interface GameContent {
  spec: string;
  formatVersion: number;
  title?: string;
  startNodeId?: string;
  revision?: string;
  defaultStats?: Record<string, number>;
  randomSeed?: number;
  itemsRef?: string;
  charactersRef?: string;
  assetsRef?: string;
  catalogRef?: string;
  libraryRef?: string;
  cookRef?: string;
  relationshipOverrides?: Record<string, RelationshipScores>;
  platforms?: ScenarioPlatforms;
  chapters: ChapterRef[];
  nodes?: Record<string, NodeContent>;
  deathNode?: InlineNodeContent;
}

/** @compat – plain string form (`"@id"`) predates the object form; both are valid. Object `params` absent in pre-parameterized refs; treat missing as no substitution. */
export type SnippetRef = string | { $snippet: string; params?: Record<string, string> };
export type TextEntry = TextBlock | SnippetRef;

export type ArrayMergeMode = "replace" | "append" | "prepend";

export interface MergeConfig {
  text?: ArrayMergeMode;
  onEnter?: ArrayMergeMode;
  choices?: ArrayMergeMode;
}

export interface InlineNodeContent {
  title?: string;
  backgroundRef?: string;
  mode?: NodeMode;
  $extends?: string;
  /** @compat – absent in nodes authored before `$merge` was added; omitting means `replace` for all arrays. */
  $merge?: MergeConfig;
  text?: TextEntry[];
  onEnter?: Effect[];
  choices?: ChoiceContent[];
}

export interface Chapter {
  spec: string;
  formatVersion: number;
  id: string;
  title: string;
  startNodeId: string;
  deathNodeId?: string;
  nodes: Record<string, NodeContent>;
}

export interface NodeContent {
  id: string;
  $extends?: string;
  /** @compat – absent in nodes authored before `$merge` was added; omitting means `replace` for all arrays. */
  $merge?: MergeConfig;
  title?: string;
  backgroundRef?: string;
  mode?: NodeMode;
  text?: TextEntry[];
  onEnter?: Effect[];
  choices?: ChoiceContent[];
}

export interface TextBlock {
  kind: string;
  text: string;
  else?: string;
  when?: Gate;
  unless?: Gate;
  speaker?: string;
  emotion?: string;
  side?: DialogueSide;
  actor?: string;
}

export interface ChoiceContent {
  id: string;
  label: string;
  sfx?: string;
  requires?: Gate;
  when?: Gate;
  unless?: Gate;
  disabledReason?: string;
  whenDisabledReason?: string;
  unlessDisabledReason?: string;
  effects?: Effect[];
  goto?: string;
  check?: SkillCheckContent;
  action?: ChoiceAction;
}

export type RollMode = "normal" | "advantage" | "disadvantage";

export interface SkillCheckContent {
  stat: string;
  difficulty: number;
  modifier?: ExprInput;
  label?: string;
  rollMode?: RollMode;
  maxAttempts?: number;
  onSuccess: SkillCheckOutcome;
  onFailure: SkillCheckOutcome;
  onExhausted?: SkillCheckOutcome;
}

export interface SkillCheckOutcome {
  effects?: Effect[];
  goto?: string;
}

export type ChoiceAction =
  | { type: "restartGame"; startNodeId: string }
  | { type: "openLoadMenu" }
  | { type: "openMainMenu" }
  | { type: "gotoChapter"; chapterId: string; nodeId?: string };

export type Gate = Gate[] | GateNode;

export type GateNode =
  | { type: "hasItem"; itemId: string; count?: number; disabledReason?: string }
  | { type: "hasFlag"; flag: string; value?: JsonValue; disabledReason?: string }
  | { type: "statGte"; stat: string; value: number; disabledReason?: string }
  | { type: "statLte"; stat: string; value: number; disabledReason?: string }
  | { type: "statEq"; stat: string; value: number; disabledReason?: string }
  | { type: "visited"; nodeId: string; disabledReason?: string }
  | { type: "atNode"; nodeId: string; disabledReason?: string }
  | {
      type: "relationshipGte";
      characterId: string;
      metric: string;
      value: number;
      disabledReason?: string;
    }
  | {
      type: "relationshipLte";
      characterId: string;
      metric: string;
      value: number;
      disabledReason?: string;
    }
  | {
      type: "relationshipEq";
      characterId: string;
      metric: string;
      value: number;
      disabledReason?: string;
    }
  | { type: "all"; conditions: Gate[] }
  | { type: "any"; conditions: Gate[] }
  | { type: "not"; condition: Gate }
  | { type: "condition"; id: string; disabledReason?: string }
  | { type: "actorPresent"; characterId: string; disabledReason?: string };

export type Condition =
  | { type: "hasItem"; itemId: string; count?: number }
  | { type: "hasFlag"; flag: string; value?: JsonValue }
  | { type: "statGte"; stat: string; value: number }
  | { type: "statLte"; stat: string; value: number }
  | { type: "statEq"; stat: string; value: number }
  | { type: "visited"; nodeId: string }
  | { type: "atNode"; nodeId: string }
  | { type: "relationshipGte"; characterId: string; metric: string; value: number }
  | { type: "relationshipLte"; characterId: string; metric: string; value: number }
  | { type: "relationshipEq"; characterId: string; metric: string; value: number };

export type Effect =
  | { type: "setFlag"; flag: string; value?: JsonValue; valueExpr?: ExprInput }
  | { type: "modifyStat"; stat: string; amount?: number; amountExpr?: ExprInput }
  | { type: "addItem"; itemId: string; count?: number; countExpr?: ExprInput }
  | { type: "removeItem"; itemId: string; count?: number; countExpr?: ExprInput }
  | { type: "addEvent"; eventId: string }
  | { type: "playMusic"; track: string }
  | { type: "stopMusic" }
  | { type: "playSfx"; sfx: string }
  | { type: "roll"; sides?: number; label?: string; storeFlag?: string }
  | {
      type: "modifyRelationship";
      characterId: string;
      metric: string;
      amount?: number;
      amountExpr?: ExprInput;
    }
  | { type: "setActorPresent"; characterId: string; value: boolean };

export type ExprInput = string | Expr;

export type Expr =
  | number
  | boolean
  | string
  | { var: string }
  | { call: string; args: Expr[] }
  | { op: string; left: Expr; right?: Expr };

export interface ItemCatalog {
  spec: string;
  formatVersion: number;
  items: Record<string, ItemDefinition>;
}

export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  examineText?: string;
  iconRef?: string;
  actions?: ItemAction[];
}

export interface ItemAction {
  id: string;
  label: string;
  requires?: Gate;
  when?: Gate;
  unless?: Gate;
  disabledReason?: string;
  whenDisabledReason?: string;
  unlessDisabledReason?: string;
  effects?: Effect[];
  goto?: string;
  consume?: boolean;
}

export interface CharacterCatalog {
  spec: string;
  formatVersion: number;
  characters: Record<string, CharacterDefinition>;
}

export interface CharacterDefinition {
  id: string;
  name: string;
  subtitle?: string;
  portraitRef?: string;
  voiceRef?: string;
  color?: string;
  relationships?: RelationshipScores;
}

export interface AssetCatalog {
  spec: string;
  formatVersion: number;
  music?: Record<string, MusicTrack>;
  sfx?: Record<string, SfxClip>;
  textures?: Record<string, TextureAsset>;
  defaultChoiceSfx?: string;
}

export type AssetUsage = "internal" | "external";

export interface MusicTrack {
  src: string;
  loop?: boolean;
  usage?: AssetUsage;
}

export interface SfxClip {
  src: string;
  usage?: AssetUsage;
}

export interface TextureAsset {
  src: string;
  usage?: AssetUsage;
}

export interface EditorLayout {
  chapters: Record<string, { nodes: Record<string, { x: number; y: number }> }>;
}

export type DirtyDoc =
  | "scenario"
  | "layout"
  | `chapter:${string}`
  | "items"
  | "characters"
  | "assets"
  | "library";

export interface CatalogEntry {
  title?: string;
  description?: string;
  internal?: boolean;
}

export interface MetaCatalog {
  spec: string;
  formatVersion: number;
  events: Record<string, CatalogEntry>;
  flags: Record<string, CatalogEntry>;
}

export interface LibraryDocument {
  spec: string;
  formatVersion: number;
  snippets: Record<string, TextBlock>;
  templates: Record<string, InlineNodeContent>;
  /** @compat – absent in library.json files authored before named conditions were added; treat missing as `{}`. */
  conditions?: Record<string, Gate>;
}
