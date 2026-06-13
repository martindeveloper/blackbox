import { useCallback } from "react";
import { commandErrorMessage, submitCommand, type BlackboxEngine } from "../../lib/engine.js";
import { logger } from "../../lib/logger.js";
import { Profiler } from "../../lib/profiler.js";
import { logViewDiagnostics } from "../../lib/viewDiagnostics.js";
import { rollStatusFailed, rollStatusSummary } from "../../lib/rolls.js";
import type { CommandResult, GameView } from "../../types/game.js";
import { trackCommandAnalytics } from "./trackCommandAnalytics.js";
import { commitSessionView } from "./commitSessionView.js";
import type { SessionPresentationAdapter } from "./types.js";
import type { SessionRuntime } from "./sessionRuntime.js";

export interface ApplyCommandOutcome {
  applied: boolean;
  chapterChanged: boolean;
}

export function useApplyCommandResult(
  runtime: SessionRuntime,
  presentation: SessionPresentationAdapter,
) {
  const { refs, actions, t } = runtime;
  const { notificationIdRef, rollStatusTimerRef } = refs;
  const {
    setAppStatus,
    setSession,
    setPresentationBaselineStats,
    setPresentationLocation,
    setResolutionEpoch,
    setLastRolls,
    setNotifications,
    setExamine,
    persistAutosave,
    playSfxSafe,
    currentTotalPlaytimeMs,
    endAnalyticsSession,
  } = actions;

  return useCallback(
    (
      result: CommandResult,
      fallback: string,
      engine: BlackboxEngine,
      previousView: GameView,
      command: Parameters<typeof submitCommand>[1],
    ): ApplyCommandOutcome => {
      if (!result.ok || !result.view) {
        const msg = commandErrorMessage(result, fallback);
        setAppStatus(msg, "error");
        logger.error("session", "Command failed", { msg, result });
        return { applied: false, chapterChanged: false };
      }

      const resultView = result.view;
      const rolls = result.rolls ?? [];
      const { nodeChanged } = commitSessionView({
        previousView,
        nextView: resultView,
        presentation,
        notificationIdRef,
        setPresentationBaselineStats,
        setPresentationLocation,
        setResolutionEpoch,
        setSession,
        setNotifications,
        alwaysAnimatePresentation: false,
        mergeNotifications: true,
        rolls,
      });

      if (nodeChanged) {
        Profiler.event("session.node_changed", resultView.node_id, {
          from: previousView.node_id,
          chapter: resultView.chapter_id,
          mode: resultView.mode,
        });
      }

      setLastRolls(rolls);

      if (result.examine) setExamine(result.examine);
      if (rolls.length > 0) {
        setAppStatus(t("rolls.checkInProgress"), "info");
        logger.debug("session", "Roll results", { rolls });
        if (rollStatusTimerRef.current) clearTimeout(rollStatusTimerRef.current);
        const revealDelayMs = presentation.rollRevealDelayMs(rolls.length);
        rollStatusTimerRef.current = setTimeout(() => {
          rollStatusTimerRef.current = null;
          const summary = rollStatusSummary(rolls);
          setAppStatus(summary, rollStatusFailed(rolls) ? "error" : "ready");
        }, revealDelayMs);
      } else if (nodeChanged) {
        if (rollStatusTimerRef.current) {
          clearTimeout(rollStatusTimerRef.current);
          rollStatusTimerRef.current = null;
        }
        setAppStatus(t("status.online"), "ready");
      }
      if (result.selected_sfx) playSfxSafe(result.selected_sfx, "Choice");
      if (result.triggered_sfx) playSfxSafe(result.triggered_sfx, "Triggered");

      trackCommandAnalytics(command, previousView, resultView, rolls, {
        chapterChanged: Boolean(result.chapter_changed),
        endAnalyticsSession,
        currentTotalPlaytimeMs,
      });

      logger.debug("session", `-> ${resultView.node_id}`, { mode: resultView.mode });
      logViewDiagnostics(resultView, "command");
      persistAutosave(engine, resultView.mode, resultView.chapter_id);

      return { applied: true, chapterChanged: Boolean(result.chapter_changed) };
    },
    [
      currentTotalPlaytimeMs,
      endAnalyticsSession,
      notificationIdRef,
      persistAutosave,
      playSfxSafe,
      presentation,
      rollStatusTimerRef,
      setAppStatus,
      setExamine,
      setLastRolls,
      setNotifications,
      setPresentationBaselineStats,
      setPresentationLocation,
      setResolutionEpoch,
      setSession,
      t,
    ],
  );
}
