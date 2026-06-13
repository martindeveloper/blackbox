import type { BlackboxEngine } from "../../lib/engine.js";
import type { GameView, ScenarioBundle, UiNotification } from "../../types/game.js";

export type SessionPhase =
  | { phase: "loading" }
  | { phase: "selecting_slot"; bundle: ScenarioBundle; returnedFromSlot?: number }
  | { phase: "ready"; engine: BlackboxEngine; bundle: ScenarioBundle; view: GameView }
  | { phase: "error"; message: string };

export type ReadySession = Extract<SessionPhase, { phase: "ready" }>;

export interface SessionPresentationAdapter {
  collectStateNotifications: (
    previous: GameView,
    current: GameView,
    nextId: () => number,
  ) => UiNotification[];
  rollRevealDelayMs: (rollCount: number) => number;
  chapterTransitionMs: number;
}
