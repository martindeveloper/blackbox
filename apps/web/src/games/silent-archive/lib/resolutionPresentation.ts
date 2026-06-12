import type { RollRecord, UiNotification } from "../../../engine/types/game.js";
import { hpDamageAmount } from "../../../engine/lib/stateChanges.js";
import { narrativeSequenceMs, rollsSequenceMs, UI_TIMING } from "../uiConfig.js";

export { hpDamageAmount, mergeDisplayStats } from "../../../engine/lib/stateChanges.js";

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
  rolls: RollRecord[],
  notifications: UiNotification[],
  options: {
    mode: ResolutionPresentationMode;
    textBlockCount?: number;
    resolutionLeadMs?: number;
  },
): number {
  const damageIndex = notifications.findIndex((notification) => notification.category === "damage");
  const damageOffset = damageIndex >= 0 ? damageIndex * UI_TIMING.notificationStaggerMs : 0;

  if (options.mode === "narrative-first") {
    return narrativeSequenceMs(options.textBlockCount ?? 0) + damageOffset;
  }

  const resolutionStart = options.resolutionLeadMs ?? 0;
  const rollDelay = rollsSequenceMs(rolls.length);
  return resolutionStart + rollDelay + damageOffset;
}
