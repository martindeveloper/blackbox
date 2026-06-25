export type NodeMode = "normal" | "game_over" | "ending";

export type DialogueSide = "left" | "right" | "center";

export interface TextBlock {
  kind: string;
  text: string;
  speaker?: string;
  emotion?: string;
  side?: DialogueSide;
}

export interface MusicCue {
  ref_id: string;
  src: string;
  loop: boolean;
}

export interface SfxCue {
  ref_id: string;
  src: string;
}

export interface TextureCue {
  ref_id: string;
  src: string;
}

export interface RelationshipMetricView {
  key: string;
  value: number;
}

export interface CharacterView {
  ref_id: string;
  name: string;
  subtitle?: string;
  portrait?: TextureCue;
  voiceRef?: string;
  color?: string;
  metrics: RelationshipMetricView[];
}

export interface RelationshipCharacterView {
  ref_id: string;
  name: string;
  subtitle?: string;
  color?: string;
  metrics: RelationshipMetricView[];
}

export interface InventoryItemView {
  ref_id: string;
  name: string;
  count: number;
  icon?: TextureCue;
}

export interface ItemActionView {
  item_ref: string;
  action_id: string;
  label: string;
  enabled: boolean;
  disabledReason?: string;
}

export interface ItemExamineView {
  ref_id: string;
  name: string;
  description: string;
  examine_text: string;
  icon?: TextureCue;
}

export type ChoiceAction =
  | { type: "restartGame"; startNodeId: string }
  | { type: "openLoadMenu" }
  | { type: "openMainMenu" }
  | { type: "gotoChapter"; chapterId: string; nodeId?: string };

export type RollMode = "normal" | "advantage" | "disadvantage";

export interface CheckPreview {
  stat: string;
  difficulty: number;
  label?: string;
  rollMode?: RollMode;
  maxAttempts?: number;
  attemptsUsed?: number;
}

export type RollRecord =
  | {
      kind: "skillCheck";
      label?: string;
      stat: string;
      difficulty: number;
      roll: number;
      modifier: number;
      total: number;
      success: boolean;
      rollMode?: RollMode;
    }
  | {
      kind: "roll" | "random" | "dice";
      label?: string;
      sides?: number;
      roll: number;
      modifier: number;
      total: number;
    };

export type UiNotification =
  | {
      id: number;
      category: "damage";
      amount: number;
      hp: number;
      maxHp?: number;
    }
  | {
      id: number;
      category: "healing";
      amount: number;
      hp: number;
      maxHp?: number;
    }
  | {
      id: number;
      category: "stat";
      change: "gained" | "lost";
      stat: string;
      amount: number;
      value: number;
    }
  | {
      id: number;
      category: "intel";
      change: "acquired" | "lost";
      intelRef: string;
      intelName: string;
    }
  | {
      id: number;
      category: "item";
      change: "acquired" | "lost";
      itemRef: string;
      itemName: string;
      amount: number;
      count: number;
      icon?: TextureCue;
    };

export interface ChoiceView {
  id: string;
  label: string;
  enabled: boolean;
  disabledReason?: string;
  check?: CheckPreview;
  action?: ChoiceAction;
  sfx?: SfxCue;
}

export interface CatalogEntry {
  title?: string;
  description?: string;
  internal: boolean;
}

export interface MetaCatalog {
  events: Record<string, CatalogEntry>;
  flags: Record<string, CatalogEntry>;
}

export interface GameView {
  scenario_title?: string;
  chapter_id?: string;
  chapter_title?: string;
  node_id: string;
  title?: string;
  mode: NodeMode;
  text: TextBlock[];
  choices: ChoiceView[];
  music?: MusicCue;
  background?: TextureCue;
  inventory_items: InventoryItemView[];
  item_actions: ItemActionView[];
  characters: CharacterView[];
  relationships: RelationshipCharacterView[];
  player_stats: Record<string, number>;
  inventory: Record<string, number>;
  flags: Record<string, unknown>;
  events: string[];
  meta: MetaCatalog;
}

export type EngineError =
  | { type: "contentDecodeError"; format: string; message: string }
  | { type: "stateEncodeError"; format: string; message: string }
  | { type: "stateDecodeError"; format: string; message: string }
  | { type: "hostEncodeError"; format: string; message: string }
  | { type: "hostDecodeError"; format: string; message: string }
  | { type: "unknownNode"; 0: string }
  | { type: "unknownChoice"; 0: string }
  | { type: "choiceDisabled"; choiceId: string; reason: string }
  | { type: "expressionError"; 0: string }
  | { type: "validationError"; 0: string }
  | {
      type: "revisionMismatch";
      save: string;
      current: string;
    }
  | { type: "unknownItem"; 0: string }
  | { type: "itemNotOwned"; itemRef: string }
  | { type: "unknownItemAction"; itemRef: string; actionId: string }
  | { type: "itemActionDisabled"; itemRef: string; actionId: string; reason: string }
  | { type: "ambiguousItemAction"; itemRef: string };

export interface CommandResult {
  ok: boolean;
  view?: GameView;
  error?: EngineError;
  selected_sfx?: SfxCue;
  triggered_sfx?: SfxCue;
  rolls?: RollRecord[];
  examine?: ItemExamineView;
  chapter_changed?: boolean;
}

export interface ScenarioBundle {
  scenario: Uint8Array;
  items: Uint8Array;
  characters: Uint8Array;
  assets: Uint8Array;
  project?: {
    chapters: Array<{ id: string; title: string }>;
    startChapterId: string;
  };
}
