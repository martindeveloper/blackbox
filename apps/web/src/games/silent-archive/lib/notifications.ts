import type { GameView, UiNotification } from "../../../engine/types/game.js";
import { collectStateNotifications as collectEngineNotifications } from "../../../engine/lib/notifications.js";

const STAT_NOTIFICATION_ORDER = ["empathy", "logic", "violence", "conviction"] as const;

export function collectStateNotifications(
  previous: GameView,
  current: GameView,
  nextId: () => number,
): UiNotification[] {
  return collectEngineNotifications(previous, current, nextId, {
    statOrder: STAT_NOTIFICATION_ORDER,
  });
}
