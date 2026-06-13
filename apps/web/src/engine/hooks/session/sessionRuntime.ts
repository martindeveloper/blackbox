import type { Dispatch, RefObject, SetStateAction } from "react";
import type { TFunction } from "i18next";
import type { BlackboxEngine, StatusKind } from "../../lib/engine.js";
import type {
  GameView,
  ItemExamineView,
  RollRecord,
  SfxCue,
  UiNotification,
} from "../../types/game.js";
import type { SessionPhase } from "./types.js";

export interface SessionRuntimeRefs {
  sessionRef: RefObject<SessionPhase>;
  commandPendingRef: RefObject<boolean>;
  activeSlotRef: RefObject<number>;
  lastAutosaveRef: RefObject<string | null>;
  notificationIdRef: RefObject<number>;
  rollStatusTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  playtimeStartedAtRef: RefObject<number | null>;
}

export interface SessionRuntimeActions {
  setSession: Dispatch<SetStateAction<SessionPhase>>;
  setAppStatus: (message: string, kind?: StatusKind) => void;
  setCommandPending: Dispatch<SetStateAction<boolean>>;
  setPresentationBaselineStats: Dispatch<SetStateAction<Record<string, number>>>;
  setPresentationLocation: Dispatch<SetStateAction<string | undefined>>;
  setResolutionEpoch: Dispatch<SetStateAction<number>>;
  setNotifications: Dispatch<SetStateAction<UiNotification[]>>;
  setLastRolls: Dispatch<SetStateAction<RollRecord[]>>;
  setExamine: Dispatch<SetStateAction<ItemExamineView | null>>;
  setChapterTransition: Dispatch<SetStateAction<string | null>>;
  setSavedState: Dispatch<SetStateAction<string | null>>;
  setMenuLoading: Dispatch<SetStateAction<boolean>>;
  setChapterLoading: Dispatch<SetStateAction<boolean>>;
  setChapterLoadingDone: Dispatch<SetStateAction<boolean>>;
  cancelAutosave: () => void;
  clearTransientUi: () => void;
  persistAutosave: (engine: BlackboxEngine, mode: GameView["mode"], chapterId?: string) => void;
  takePlaytimeDelta: () => number;
  playSfxSafe: (sfx: SfxCue, label: string) => void;
  reportBootError: (stage: string, error: unknown) => void;
  startPlaytimeClock: () => void;
  startAnalyticsSession: (source: string, view: GameView, totalPlaytimeMs: number) => void;
  endAnalyticsSession: (reason: string, view: GameView, totalPlaytimeMs?: number) => void;
  flushPlaytime: () => void;
  currentTotalPlaytimeMs: () => number;
}

export interface SessionRuntime {
  refs: SessionRuntimeRefs;
  actions: SessionRuntimeActions;
  t: TFunction;
}
