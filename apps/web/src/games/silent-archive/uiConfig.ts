import {
  createUiTiming,
  type MusicFadeKind,
  type UiTimingValues,
} from "../../engine/lib/uiTiming.js";

export type { MusicFadeKind };

export const UI_TIMING: UiTimingValues = {
  chapterTransitionMs: 5200,
  musicCrossfadeSecs: 1.5,
  musicLoopDelayMs: 6000,
  narrativeFadeMs: 2600,
  stageDirectionFadeMs: 1600,
  narrativeInitialDelayMs: 240,
  narrativeStaggerMs: 520,
  narrativeMaxDelayMs: 2840,
  narrativeBufferMs: 160,
  resolutionEntryFadeMs: 480,
  notificationFadeMs: 620,
  notificationScanMs: 780,
  notificationScanDelayMs: 110,
  notificationStaggerMs: 130,
  notificationBufferMs: 200,
  rollDurationMs: 1650,
  rollStaggerMs: 500,
  rollPipIntervalMs: 92,
  rollSettleMs: 380,
  rollVerdictFadeMs: 420,
  rollSequenceBufferMs: 420,
  choiceFadeMs: 1100,
  choiceInitialDelayMs: 160,
  choiceStaggerMs: 240,
  choiceResolvingSweepMs: 1400,
  responseHeaderFadeMs: 320,
  locationFadeMs: 300,
  backgroundFadeMs: 900,
  damageHitMs: 540,
  damageCriticalPulseMs: 3800,
};

export const timing = createUiTiming(UI_TIMING);

export const UI_CSS_VARS = timing.cssVars;
export const resolveMusicFade = timing.resolveMusicFade;
export const narrativeSequenceMs = timing.narrativeSequenceMs;
export const rollsSequenceMs = timing.rollsSequenceMs;
export const notificationsSequenceMs = timing.notificationsSequenceMs;
export const resolutionSequenceMs = timing.resolutionSequenceMs;
export const resolutionLeadMs = timing.resolutionLeadMs;

export const UI_FLAGS = {
  /** Show raw gate requirement details on locked choices (e.g. "Requires flag: X > 5").
   *  Set to false before shipping to avoid leaking internal stat/flag/event names. */
  showGateDetails: false,
} as const;

export const UI_SHORTCUTS = {
  inventory: { key: "i", display: "I", aria: "I" },
  intel: { key: "?", display: "?", aria: "?" },
  journal: { key: "j", display: "J", aria: "J" },
  mute: { key: "m", display: "M", aria: "M" },
  system: { key: "Escape", display: "ESC", aria: "Escape" },
} as const;
