// @engine/sdk/v1/notifications - state-notification diffing (Blackbox engine API v1).
import type { GameView, UiNotification } from "./types.js";
import * as notifications from "@engine/lib/notifications.js";

export type StateNotificationOptions = notifications.StateNotificationOptions;

export function collectStateNotifications(
  previous: GameView,
  current: GameView,
  nextId: () => number,
  options: StateNotificationOptions = {},
): UiNotification[] {
  return notifications.collectStateNotifications(previous, current, nextId, options);
}
