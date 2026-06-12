import type { RollRecord, UiNotification } from "../types/game.js";
import { hpDamageAmount } from "./stateChanges.js";
import type { UiTiming } from "./uiTiming.js";

export { hpDamageAmount, mergeDisplayStats } from "./stateChanges.js";

export type ResolutionPresentationMode = "dice-first" | "narrative-first" | "none";

export function resolutionPresentationMode(
  rolls: RollRecord[],
  notifications: UiNotification[],
): ResolutionPresentationMode {
  if (rolls.length > 0) return "dice-first";
  if (notifications.length > 0) return "narrative-first";
  return "none";
}

export interface DamagePulse {
  id: number;
  strength: number;
}

export function shouldDeferHpReveal(
  previous: Record<string, number>,
  current: Record<string, number>,
  rolls: RollRecord[],
  notifications: UiNotification[],
): boolean {
  if (hpDamageAmount(previous, current) === null) return false;
  return (
    rolls.length > 0 || notifications.some((notification) => notification.category === "damage")
  );
}

export function hpRevealDelayMs(
  timing: UiTiming,
  rolls: RollRecord[],
  notifications: UiNotification[],
  options: {
    mode: ResolutionPresentationMode;
    textBlockCount?: number;
    resolutionLeadMs?: number;
  },
): number {
  const damageIndex = notifications.findIndex((notification) => notification.category === "damage");
  const damageOffset = damageIndex >= 0 ? damageIndex * timing.values.notificationStaggerMs : 0;

  if (options.mode === "narrative-first") {
    return timing.narrativeSequenceMs(options.textBlockCount ?? 0) + damageOffset;
  }

  const resolutionStart = options.resolutionLeadMs ?? 0;
  const rollDelay = timing.rollsSequenceMs(rolls.length);
  return resolutionStart + rollDelay + damageOffset;
}
