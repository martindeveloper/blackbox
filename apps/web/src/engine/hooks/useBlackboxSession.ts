import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  bootEngine,
  ensureChaptersForCommand,
  isOfferedChoiceRejected,
  isWasmRuntimeFailure,
  makeBootError,
  retryUnknownNodeCommand,
  serializeEngineState,
  submitCommand,
  toErrorMessage,
  type StatusKind,
} from "../lib/engine.js";
import { logger } from "../lib/logger.js";
import {
  importPlayerStorageSnapshot,
  readPlayerStorageSnapshot,
} from "../lib/playerStorageAdmin.js";
import { PREVIEW_ENABLED, flushPreviewStorage } from "@preview-mode";
import { setPreviewCheckpointHandlers } from "../../preview/checkpointBridge.js";
import { publishPreviewRuntimeState } from "../../preview/runtimeStatePublisher.js";
import type { ItemExamineView, RollRecord, SfxCue, UiNotification } from "../types/game.js";
import { useApplyCommandResult } from "./session/useApplyCommandResult.js";
import { finalizeChapterChange } from "./session/finalizeChapterChange.js";
import { useGameAnalytics } from "./session/useGameAnalytics.js";
import { useSessionAutosave } from "./session/useSessionAutosave.js";
import { useSessionDevConsole } from "./session/useSessionDevConsole.js";
import { useSlotNavigation } from "./session/useSlotNavigation.js";
import { useSlotPlaytime } from "./session/useSlotPlaytime.js";
import type { SessionRuntime } from "./session/sessionRuntime.js";
import type { SessionPhase, SessionPresentationAdapter } from "./session/types.js";

export type { SessionPhase, SessionPresentationAdapter } from "./session/types.js";

interface UseBlackboxSessionOptions {
  presentation: SessionPresentationAdapter;
  onSfx?: (sfx: SfxCue) => void;
}

export function useBlackboxSession({ onSfx, presentation }: UseBlackboxSessionOptions) {
  const { t } = useTranslation();
  const onSfxRef = useRef(onSfx);
  useEffect(() => {
    onSfxRef.current = onSfx;
  }, [onSfx]);

  const [session, setSession] = useState<SessionPhase>({ phase: "loading" });
  const sessionRef = useRef<SessionPhase>(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const [status, setStatus] = useState(() => t("status.loading"));
  const [statusKind, setStatusKind] = useState<StatusKind>("info");
  const [savedState, setSavedState] = useState<string | null>(null);
  const [menuLoading, setMenuLoading] = useState(false);

  const [lastRolls, setLastRolls] = useState<RollRecord[]>([]);
  const [notifications, setNotifications] = useState<UiNotification[]>([]);
  const [presentationBaselineStats, setPresentationBaselineStats] = useState<
    Record<string, number>
  >({});
  const [presentationLocation, setPresentationLocation] = useState<string | undefined>(undefined);
  const [resolutionEpoch, setResolutionEpoch] = useState(0);
  const [examine, setExamine] = useState<ItemExamineView | null>(null);
  const [chapterTransition, setChapterTransition] = useState<string | null>(null);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [chapterLoadingDone, setChapterLoadingDone] = useState(false);
  const [commandPending, setCommandPending] = useState(false);

  const commandPendingRef = useRef(false);
  const lastAutosaveRef = useRef<string | null>(null);
  const activeSlotRef = useRef(0);
  const notificationIdRef = useRef(0);
  const rollStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setAppStatus = useCallback((message: string, kind: StatusKind = "info") => {
    setStatus(message);
    setStatusKind(kind);
  }, []);

  const reportBootError = useCallback(
    (stage: string, error: unknown) => {
      const err =
        error instanceof Error && error.name === "BootError" ? error : makeBootError(stage, error);
      setSession({ phase: "error", message: err.message });
      setAppStatus(err.message, "error");
      logger.error("session", err.message, { cause: err.cause ?? error });
    },
    [setAppStatus],
  );

  const {
    playtimeStartedAtRef,
    startPlaytimeClock,
    takePlaytimeDelta,
    flushPlaytime,
    currentTotalPlaytimeMs,
  } = useSlotPlaytime(activeSlotRef);

  const { startAnalyticsSession, endAnalyticsSession } = useGameAnalytics(currentTotalPlaytimeMs);

  const { cancelAutosave, persistAutosave, recoverFromAutosave } = useSessionAutosave({
    activeSlotRef,
    commandPendingRef,
    lastAutosaveRef,
    takePlaytimeDelta,
    setSession,
    setAppStatus,
    t,
  });

  const clearTransientUi = useCallback(() => {
    if (rollStatusTimerRef.current) {
      clearTimeout(rollStatusTimerRef.current);
      rollStatusTimerRef.current = null;
    }
    setLastRolls([]);
    setNotifications([]);
    setExamine(null);
    setPresentationLocation(undefined);
    setResolutionEpoch((epoch) => epoch + 1);
  }, []);

  const playSfxSafe = useCallback((sfx: SfxCue, label: string) => {
    logger.debug("session", `SFX queued: ${sfx.src}`);
    try {
      onSfxRef.current?.(sfx);
    } catch (error) {
      logger.error("session", `${label} SFX playback failed`, { src: sfx.src, error });
    }
  }, []);

  const runtime = useMemo<SessionRuntime>(
    () => ({
      refs: {
        sessionRef,
        commandPendingRef,
        activeSlotRef,
        lastAutosaveRef,
        notificationIdRef,
        rollStatusTimerRef,
        playtimeStartedAtRef,
      },
      actions: {
        setSession,
        setAppStatus,
        setCommandPending,
        setPresentationBaselineStats,
        setPresentationLocation,
        setResolutionEpoch,
        setNotifications,
        setLastRolls,
        setExamine,
        setChapterTransition,
        setSavedState,
        setMenuLoading,
        setChapterLoading,
        setChapterLoadingDone,
        cancelAutosave,
        clearTransientUi,
        persistAutosave,
        takePlaytimeDelta,
        playSfxSafe,
        reportBootError,
        startPlaytimeClock,
        startAnalyticsSession,
        endAnalyticsSession,
        flushPlaytime,
        currentTotalPlaytimeMs,
      },
      t,
    }),
    [
      cancelAutosave,
      clearTransientUi,
      currentTotalPlaytimeMs,
      endAnalyticsSession,
      flushPlaytime,
      persistAutosave,
      playSfxSafe,
      playtimeStartedAtRef,
      reportBootError,
      setAppStatus,
      startAnalyticsSession,
      startPlaytimeClock,
      takePlaytimeDelta,
      t,
    ],
  );

  const applyCommandResult = useApplyCommandResult(runtime, presentation);
  const executeDevCommand = useSessionDevConsole(runtime, presentation);
  const { continueSlot, restartSlot, restart, returnToChapterStart, goToMainMenu, save, restore } =
    useSlotNavigation(runtime);

  useEffect(() => {
    if (!PREVIEW_ENABLED) return;
    setPreviewCheckpointHandlers({
      capture: () => {
        const s = sessionRef.current;
        if (s.phase !== "ready") return null;
        return {
          storage: readPlayerStorageSnapshot(),
          engineState: serializeEngineState(s.engine),
          nodeId: s.view.node_id,
          chapterId: s.view.chapter_id,
          location: presentationLocation,
        };
      },
      restore: (checkpoint) => {
        importPlayerStorageSnapshot(checkpoint.storage);
        restore(checkpoint.engineState);
        flushPreviewStorage();
        publishPreviewRuntimeState();
      },
    });
    return () => setPreviewCheckpointHandlers(null);
  }, [presentationLocation, restore]);

  const runCommand = useCallback(
    (
      command: Parameters<typeof submitCommand>[1],
      fallback: string,
      options?: { clearExamine?: boolean },
    ) => {
      const s = sessionRef.current;
      if (s.phase !== "ready" || commandPendingRef.current) return;

      cancelAutosave();
      commandPendingRef.current = true;
      setCommandPending(true);
      if (options?.clearExamine) setExamine(null);

      void (async () => {
        try {
          if (s.bundle.project) {
            await ensureChaptersForCommand(s.engine, command, s.view);
          }

          let result = submitCommand(s.engine, command);
          if (!result.ok && result.error?.type === "unknownNode" && s.bundle.project) {
            result = await retryUnknownNodeCommand(s.engine, command, s.view, () =>
              submitCommand(s.engine, command),
            );
          }

          if (isOfferedChoiceRejected(s.view, command, result)) {
            logger.warn(
              "session",
              "Offered choice rejected by engine — attempting autosave recovery",
              {
                command,
                viewNode: s.view.node_id,
                offered: s.view.choices.map((choice) => choice.id),
              },
            );
            if (await recoverFromAutosave(s, "offered_choice_rejected", { command })) {
              clearTransientUi();
              return;
            }
          }

          const previousChapterId = s.view.chapter_id;
          const outcome = applyCommandResult(result, fallback, s.engine, s.view, command);

          if (outcome.applied && outcome.chapterChanged && result.view) {
            await finalizeChapterChange({
              engine: s.engine,
              previousChapterId,
              previousView: s.view,
              nextView: result.view,
              hasProject: Boolean(s.bundle.project),
              activeSlotRef,
              lastAutosaveRef,
              setChapterTransition,
              takePlaytimeDelta,
              onTransitionStart: () => setChapterLoading(true),
              onTransitionEnd: () => {
                setChapterLoading(false);
                setChapterLoadingDone(true);
              },
            });
          }
        } catch (error: unknown) {
          const msg = toErrorMessage(error);
          if (
            isWasmRuntimeFailure(error) &&
            (await recoverFromAutosave(s, "wasm_runtime_failure", { command, msg }))
          ) {
            clearTransientUi();
            return;
          }
          setAppStatus(msg, "error");
          logger.error("session", "Command wasm/parse error", {
            command,
            nodeId: s.view.node_id,
            mode: s.view.mode,
            msg,
            error,
          });
        } finally {
          commandPendingRef.current = false;
          setCommandPending(false);
        }
      })();
    },
    [
      applyCommandResult,
      cancelAutosave,
      clearTransientUi,
      recoverFromAutosave,
      setAppStatus,
      takePlaytimeDelta,
    ],
  );

  useEffect(() => {
    return () => {
      cancelAutosave();
      const currentSession = sessionRef.current;
      if (currentSession.phase === "ready") {
        endAnalyticsSession("app_closed", currentSession.view);
      }
      flushPlaytime();
    };
  }, [cancelAutosave, endAnalyticsSession, flushPlaytime]);

  useEffect(() => {
    let cancelled = false;
    bootEngine()
      .then((result) => {
        if (cancelled) return;
        setSession({ phase: "selecting_slot", bundle: result.bundle });
        setAppStatus(t("status.selectSlot"), "info");
        logger.info("session", "Bundle ready — showing slot selector");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        reportBootError(t("errors.bootFailed"), error);
      });
    return () => {
      cancelled = true;
    };
  }, [setAppStatus, reportBootError, t]);

  useEffect(() => {
    if (!chapterTransition) return;
    const timer = setTimeout(() => {
      setChapterTransition(null);
      setChapterLoadingDone(false);
    }, presentation.chapterTransitionMs);
    return () => clearTimeout(timer);
  }, [chapterTransition, presentation.chapterTransitionMs]);

  const choose = useCallback(
    (choiceId: string) => {
      logger.debug("session", `choose: ${choiceId}`);
      runCommand({ type: "choose", choice_id: choiceId }, t("status.commandFailed"), {
        clearExamine: true,
      });
    },
    [runCommand, t],
  );

  const continueStory = useCallback(() => {
    logger.debug("session", "continue");
    runCommand({ type: "continue" }, t("status.continueFailed"), { clearExamine: true });
  }, [runCommand, t]);

  const examineItem = useCallback(
    (itemRef: string) => {
      logger.debug("session", `examine: ${itemRef}`);
      runCommand({ type: "examine", item_ref: itemRef }, t("status.examineFailed"));
    },
    [runCommand, t],
  );

  const useItem = useCallback(
    (itemRef: string, actionId: string) => {
      logger.debug("session", `use item: ${itemRef} / ${actionId}`);
      runCommand(
        { type: "useItem", item_ref: itemRef, action_id: actionId },
        t("status.useItemFailed"),
        { clearExamine: true },
      );
    },
    [runCommand, t],
  );

  return {
    session,
    status,
    statusKind,
    savedState,
    menuLoading,
    lastRolls,
    notifications,
    presentationBaselineStats,
    presentationLocation,
    resolutionEpoch,
    examine,
    chapterTransition,
    chapterLoading,
    chapterLoadingDone,
    commandPending,
    executeDevCommand,
    choose,
    continueStory,
    examineItem,
    useItem,
    restart,
    returnToChapterStart,
    goToMainMenu,
    save,
    restore,
    continueSlot,
    restartSlot,
  };
}
