import { useCallback, useRef } from "react";
import { analytics } from "@analytics";
import type { GameView } from "../../types/game.js";

export function useGameAnalytics(currentTotalPlaytimeMs: () => number) {
  const analyticsSessionStartedAtRef = useRef<number | null>(null);
  const analyticsSessionEndedRef = useRef(true);

  const startAnalyticsSession = useCallback(
    (source: string, view: GameView, totalPlaytimeMs: number) => {
      analyticsSessionStartedAtRef.current = Date.now();
      analyticsSessionEndedRef.current = false;
      analytics.track("Game Started", {
        source,
        chapter_id: view.chapter_id,
        node_id: view.node_id,
        total_playtime_seconds: Math.floor(totalPlaytimeMs / 1000),
      });
    },
    [],
  );

  const endAnalyticsSession = useCallback(
    (reason: string, view: GameView, totalPlaytimeMs = currentTotalPlaytimeMs()) => {
      const startedAt = analyticsSessionStartedAtRef.current;
      if (startedAt === null || analyticsSessionEndedRef.current) return;
      analyticsSessionEndedRef.current = true;
      analytics.track("Game Session Ended", {
        reason,
        chapter_id: view.chapter_id,
        node_id: view.node_id,
        session_playtime_seconds: Math.floor(Math.max(0, Date.now() - startedAt) / 1000),
        total_playtime_seconds: Math.floor(totalPlaytimeMs / 1000),
      });
    },
    [currentTotalPlaytimeMs],
  );

  return { startAnalyticsSession, endAnalyticsSession };
}
