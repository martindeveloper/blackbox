import type { CSSProperties } from "react";

export const UI_TIMING = {
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
} as const;

/** Overlay holds until ~72%; crossfade completes as the reveal begins. */
export function musicChapterCrossfadeSecs(): number {
  return (UI_TIMING.chapterTransitionMs * 0.73) / 1000;
}

/** Slow bleed on death — roughly four narrative block fades. */
export function musicDeathFadeOutSecs(): number {
  return (UI_TIMING.narrativeFadeMs * 4) / 1000;
}

export type MusicFadeKind = "default" | "chapter" | "death_stop";

export function resolveMusicFade(
  kind: MusicFadeKind | undefined,
  hadTrack: boolean,
): { fadeIn: number; fadeOut: number } {
  switch (kind) {
    case "chapter": {
      const secs = musicChapterCrossfadeSecs();
      return { fadeIn: secs, fadeOut: hadTrack ? secs : 0 };
    }
    case "death_stop":
      return { fadeIn: 0, fadeOut: musicDeathFadeOutSecs() };
    default: {
      const secs = UI_TIMING.musicCrossfadeSecs;
      return { fadeIn: secs, fadeOut: hadTrack ? secs : 0 };
    }
  }
}

export function narrativeSequenceMs(textBlockCount: number): number {
  if (textBlockCount <= 0) return UI_TIMING.narrativeFadeMs + UI_TIMING.narrativeBufferMs;
  const lastDelay = Math.min(
    UI_TIMING.narrativeInitialDelayMs + (textBlockCount - 1) * UI_TIMING.narrativeStaggerMs,
    UI_TIMING.narrativeMaxDelayMs,
  );
  return lastDelay + UI_TIMING.narrativeFadeMs + UI_TIMING.narrativeBufferMs;
}

export function rollsSequenceMs(rollCount: number): number {
  if (rollCount <= 0) return 0;
  return (
    UI_TIMING.rollDurationMs +
    (rollCount - 1) * UI_TIMING.rollStaggerMs +
    UI_TIMING.rollSequenceBufferMs
  );
}

export function notificationsSequenceMs(notificationCount: number): number {
  if (notificationCount <= 0) return 0;
  return (
    (notificationCount - 1) * UI_TIMING.notificationStaggerMs +
    UI_TIMING.notificationFadeMs +
    UI_TIMING.notificationBufferMs
  );
}

export function resolutionSequenceMs(notificationCount: number, rollCount: number): number {
  return rollsSequenceMs(rollCount) + notificationsSequenceMs(notificationCount);
}

export function resolutionLeadMs(): number {
  return UI_TIMING.narrativeInitialDelayMs + UI_TIMING.narrativeBufferMs;
}

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

type UiCssVars = CSSProperties & Record<`--ui-${string}`, string>;

export const UI_CSS_VARS: UiCssVars = {
  "--ui-narrative-fade": `${UI_TIMING.narrativeFadeMs}ms`,
  "--ui-stage-direction-fade": `${UI_TIMING.stageDirectionFadeMs}ms`,
  "--ui-narrative-delay-1": `${UI_TIMING.narrativeInitialDelayMs}ms`,
  "--ui-narrative-delay-2": `${UI_TIMING.narrativeInitialDelayMs + UI_TIMING.narrativeStaggerMs}ms`,
  "--ui-narrative-delay-3": `${
    UI_TIMING.narrativeInitialDelayMs + UI_TIMING.narrativeStaggerMs * 2
  }ms`,
  "--ui-narrative-delay-4": `${
    UI_TIMING.narrativeInitialDelayMs + UI_TIMING.narrativeStaggerMs * 3
  }ms`,
  "--ui-narrative-delay-5": `${
    UI_TIMING.narrativeInitialDelayMs + UI_TIMING.narrativeStaggerMs * 4
  }ms`,
  "--ui-narrative-delay-max": `${UI_TIMING.narrativeMaxDelayMs}ms`,
  "--ui-choice-fade": `${UI_TIMING.choiceFadeMs}ms`,
  "--ui-resolution-entry-fade": `${UI_TIMING.resolutionEntryFadeMs}ms`,
  "--ui-notification-fade": `${UI_TIMING.notificationFadeMs}ms`,
  "--ui-notification-scan": `${UI_TIMING.notificationScanMs}ms`,
  "--ui-notification-scan-delay": `${UI_TIMING.notificationScanDelayMs}ms`,
  "--ui-response-fade": `${UI_TIMING.responseHeaderFadeMs}ms`,
  "--ui-location-fade": `${UI_TIMING.locationFadeMs}ms`,
  "--ui-background-fade": `${UI_TIMING.backgroundFadeMs}ms`,
  "--ui-roll-pip-interval": `${UI_TIMING.rollPipIntervalMs}ms`,
  "--ui-roll-settle": `${UI_TIMING.rollSettleMs}ms`,
  "--ui-roll-verdict": `${UI_TIMING.rollVerdictFadeMs}ms`,
  "--ui-resolving-sweep": `${UI_TIMING.choiceResolvingSweepMs}ms`,
  "--ui-damage-hit": `${UI_TIMING.damageHitMs}ms`,
  "--ui-damage-critical-pulse": `${UI_TIMING.damageCriticalPulseMs}ms`,
  "--ui-chapter-transition": `${UI_TIMING.chapterTransitionMs}ms`,
};
