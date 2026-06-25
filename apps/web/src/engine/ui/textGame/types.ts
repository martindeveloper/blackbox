import type { ComponentType, ReactNode } from "react";
import type {
  CharacterView,
  GameView,
  ItemExamineView,
  MetaCatalog,
  RollRecord,
  TextBlock,
  UiNotification,
} from "../../types/game.js";
import type { CharacterLookup } from "../../lib/characters.js";
import type { DamagePulse } from "../../lib/resolutionPresentation.js";

export interface ChoicesProps {
  view: GameView;
  isGameOver: boolean;
  isEnding: boolean;
  isTerminal: boolean;
  isRolling: boolean;
  visible: boolean;
  choiceClass: string;
  borderColor: string;
  onChoose: (choiceId: string) => void;
  onContinue: () => void;
  onReturnToChapterStart: () => void;
  onRestart: () => void;
  onOpenLoad: () => void;
  onOpenMainMenu: () => void;
}

export interface NarrativeProps {
  block: TextBlock;
  characters: CharacterLookup;
  isGameOver: boolean;
  prevBlock?: TextBlock;
  first?: boolean;
  onCharacterProfile?: (character: CharacterView) => void;
}

export interface ResolutionProps {
  rolls: RollRecord[];
  notifications: UiNotification[];
  onNotificationActivate?: (notification: UiNotification) => void;
}

export interface VitalsProps {
  playerStats: GameView["player_stats"];
  borderColor: string;
  controls?: ReactNode;
  damagePulse?: DamagePulse | null;
  onDamagePulseEnd?: () => void;
}

export interface InventoryProps {
  view: GameView;
  examine: ItemExamineView | null;
  commandPending: boolean;
  initialItemRef?: string;
  onExamine: (itemRef: string) => void;
  onUse: (itemRef: string, actionId: string) => void;
}

export interface IntelProps {
  memories: string[];
  meta: MetaCatalog;
  initialIntelRef?: string;
}

export interface JournalProps {
  events: string[];
  meta: MetaCatalog;
}

export interface MainMenuProps {
  menuLoading: boolean;
  initialSlot?: number;
  onContinueSlot: (index: number) => void;
  onRestartSlot: (index: number) => void;
  onCreateSupportBundle?: () => void;
}

export interface SystemMenuProps {
  isTerminal: boolean;
  onSave: () => void;
  onOpenMainMenu: () => void;
  onRestart: () => void;
  onCreateSupportBundle?: () => void;
}

export interface GameScreenProps {
  view: GameView;
  lastRolls: RollRecord[];
  notifications: UiNotification[];
  presentationBaselineStats: Record<string, number>;
  presentationLocation?: string;
  resolutionEpoch: number;
  commandPending: boolean;
  examine: ItemExamineView | null;
  onChoose: (choiceId: string) => void;
  onContinue: () => void;
  onExamine: (itemRef: string) => void;
  onUseItem: (itemRef: string, actionId: string) => void;
  onSave: () => void;
  onReturnToChapterStart: () => void;
  onRestart: () => void;
  onOpenLoad: () => void;
  onOpenMainMenu: () => void;
  onCreateSupportBundle?: () => void;
}

export interface TextGameComponents {
  MainMenu: ComponentType<MainMenuProps>;
  GameScreen: ComponentType<GameScreenProps>;
  SystemMenu: ComponentType<SystemMenuProps>;
  Choices: ComponentType<ChoicesProps>;
  Narrative: ComponentType<NarrativeProps>;
  Resolution: ComponentType<ResolutionProps>;
  Vitals: ComponentType<VitalsProps>;
  Inventory: ComponentType<InventoryProps>;
  Intel: ComponentType<IntelProps>;
  Journal: ComponentType<JournalProps>;
}

export type TextGameComponentOverrides = Partial<TextGameComponents>;
