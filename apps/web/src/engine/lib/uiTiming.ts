import type { CSSProperties } from "react";

export interface UiTimingValues {
  chapterTransitionMs: number;
  musicCrossfadeSecs: number;
  musicLoopDelayMs: number;
  narrativeFadeMs: number;
  stageDirectionFadeMs: number;
  narrativeInitialDelayMs: number;
  narrativeStaggerMs: number;
  narrativeMaxDelayMs: number;
  narrativeBufferMs: number;
  resolutionEntryFadeMs: number;
  notificationFadeMs: number;
  notificationScanMs: number;
  notificationScanDelayMs: number;
  notificationStaggerMs: number;
  notificationBufferMs: number;
  rollDurationMs: number;
  rollStaggerMs: number;
  rollPipIntervalMs: number;
  rollSettleMs: number;
  rollVerdictFadeMs: number;
  rollSequenceBufferMs: number;
  choiceFadeMs: number;
  choiceInitialDelayMs: number;
  choiceStaggerMs: number;
  choiceResolvingSweepMs: number;
  responseHeaderFadeMs: number;
  locationFadeMs: number;
  backgroundFadeMs: number;
  damageHitMs: number;
  damageCriticalPulseMs: number;
}

export type MusicFadeKind = "default" | "chapter" | "death_stop";

export interface MusicFade {
  fadeIn: number;
  fadeOut: number;
}

type UiCssVars = CSSProperties & Record<`--ui-${string}`, string>;

export interface UiTiming {
  values: UiTimingValues;
  cssVars: UiCssVars;
  musicChapterCrossfadeSecs(): number;
  musicDeathFadeOutSecs(): number;
  resolveMusicFade(kind: MusicFadeKind | undefined, hadTrack: boolean): MusicFade;
  narrativeSequenceMs(textBlockCount: number): number;
  rollsSequenceMs(rollCount: number): number;
  notificationsSequenceMs(notificationCount: number): number;
  resolutionSequenceMs(notificationCount: number, rollCount: number): number;
  resolutionLeadMs(): number;
}

export function createUiTiming(values: UiTimingValues): UiTiming {
  const musicChapterCrossfadeSecs = () => (values.chapterTransitionMs * 0.73) / 1000;
  const musicDeathFadeOutSecs = () => (values.narrativeFadeMs * 4) / 1000;

  const narrativeSequenceMs = (textBlockCount: number): number => {
    if (textBlockCount <= 0) return values.narrativeFadeMs + values.narrativeBufferMs;
    const lastDelay = Math.min(
      values.narrativeInitialDelayMs + (textBlockCount - 1) * values.narrativeStaggerMs,
      values.narrativeMaxDelayMs,
    );
    return lastDelay + values.narrativeFadeMs + values.narrativeBufferMs;
  };

  const rollsSequenceMs = (rollCount: number): number => {
    if (rollCount <= 0) return 0;
    return (
      values.rollDurationMs + (rollCount - 1) * values.rollStaggerMs + values.rollSequenceBufferMs
    );
  };

  const notificationsSequenceMs = (notificationCount: number): number => {
    if (notificationCount <= 0) return 0;
    return (
      (notificationCount - 1) * values.notificationStaggerMs +
      values.notificationFadeMs +
      values.notificationBufferMs
    );
  };

  const cssVars: UiCssVars = {
    "--ui-narrative-fade": `${values.narrativeFadeMs}ms`,
    "--ui-stage-direction-fade": `${values.stageDirectionFadeMs}ms`,
    "--ui-narrative-delay-1": `${values.narrativeInitialDelayMs}ms`,
    "--ui-narrative-delay-2": `${values.narrativeInitialDelayMs + values.narrativeStaggerMs}ms`,
    "--ui-narrative-delay-3": `${values.narrativeInitialDelayMs + values.narrativeStaggerMs * 2}ms`,
    "--ui-narrative-delay-4": `${values.narrativeInitialDelayMs + values.narrativeStaggerMs * 3}ms`,
    "--ui-narrative-delay-5": `${values.narrativeInitialDelayMs + values.narrativeStaggerMs * 4}ms`,
    "--ui-narrative-delay-max": `${values.narrativeMaxDelayMs}ms`,
    "--ui-choice-fade": `${values.choiceFadeMs}ms`,
    "--ui-resolution-entry-fade": `${values.resolutionEntryFadeMs}ms`,
    "--ui-notification-fade": `${values.notificationFadeMs}ms`,
    "--ui-notification-scan": `${values.notificationScanMs}ms`,
    "--ui-notification-scan-delay": `${values.notificationScanDelayMs}ms`,
    "--ui-response-fade": `${values.responseHeaderFadeMs}ms`,
    "--ui-location-fade": `${values.locationFadeMs}ms`,
    "--ui-background-fade": `${values.backgroundFadeMs}ms`,
    "--ui-roll-pip-interval": `${values.rollPipIntervalMs}ms`,
    "--ui-roll-settle": `${values.rollSettleMs}ms`,
    "--ui-roll-verdict": `${values.rollVerdictFadeMs}ms`,
    "--ui-resolving-sweep": `${values.choiceResolvingSweepMs}ms`,
    "--ui-damage-hit": `${values.damageHitMs}ms`,
    "--ui-damage-critical-pulse": `${values.damageCriticalPulseMs}ms`,
    "--ui-chapter-transition": `${values.chapterTransitionMs}ms`,
  };

  return {
    values,
    cssVars,
    musicChapterCrossfadeSecs,
    musicDeathFadeOutSecs,
    resolveMusicFade(kind, hadTrack) {
      switch (kind) {
        case "chapter": {
          const secs = musicChapterCrossfadeSecs();
          return { fadeIn: secs, fadeOut: hadTrack ? secs : 0 };
        }
        case "death_stop":
          return { fadeIn: 0, fadeOut: musicDeathFadeOutSecs() };
        default: {
          const secs = values.musicCrossfadeSecs;
          return { fadeIn: secs, fadeOut: hadTrack ? secs : 0 };
        }
      }
    },
    narrativeSequenceMs,
    rollsSequenceMs,
    notificationsSequenceMs,
    resolutionSequenceMs(notificationCount, rollCount) {
      return rollsSequenceMs(rollCount) + notificationsSequenceMs(notificationCount);
    },
    resolutionLeadMs() {
      return values.narrativeInitialDelayMs + values.narrativeBufferMs;
    },
  };
}
