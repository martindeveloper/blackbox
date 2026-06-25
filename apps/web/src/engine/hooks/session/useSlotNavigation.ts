import { useCallback } from "react";
import {
  createEngine,
  ensureChapterResident,
  readView,
  rebuildEngineFromAutosave,
  restoreEngineState,
  serializeEngineState,
  toErrorMessage,
} from "../../lib/engine.js";
import { logger } from "../../lib/logger.js";
import { Profiler } from "../../lib/profiler.js";
import { logViewDiagnostics } from "../../lib/viewDiagnostics.js";
import { clearSlot, readSlot, writeSlot } from "../../lib/slots.js";
import { persistChapterCheckpoint } from "./finalizeChapterChange.js";
import type { SessionRuntime } from "./sessionRuntime.js";

export function useSlotNavigation(runtime: SessionRuntime) {
  const { refs, actions, t } = runtime;
  const { sessionRef, commandPendingRef, activeSlotRef, lastAutosaveRef, playtimeStartedAtRef } =
    refs;
  const {
    setSession,
    setSavedState,
    setMenuLoading,
    setCommandPending,
    setChapterTransition,
    setAppStatus,
    setLastSavedAt,
    reportBootError,
    cancelAutosave,
    clearTransientUi,
    startPlaytimeClock,
    startAnalyticsSession,
    endAnalyticsSession,
    flushPlaytime,
    takePlaytimeDelta,
  } = actions;

  const continueSlot = useCallback(
    async (index: number) => {
      const s = sessionRef.current;
      if (s.phase !== "selecting_slot" || commandPendingRef.current) return;
      const slotData = readSlot(index);
      if (!slotData?.state) return;
      cancelAutosave();
      clearTransientUi();
      commandPendingRef.current = true;
      setMenuLoading(true);
      try {
        if (s.bundle.project) {
          const chapterId = slotData.chapterId ?? s.bundle.project.startChapterId;
          await ensureChapterResident(chapterId);
        }
        const engine = createEngine(s.bundle);
        const nextView = restoreEngineState(engine, slotData.state.trim());
        activeSlotRef.current = index;
        lastAutosaveRef.current = slotData.state.trim();
        setLastSavedAt(slotData.savedAt);
        startPlaytimeClock();
        startAnalyticsSession("continue", nextView, slotData.totalPlaytimeMs);
        setSession({ phase: "ready", engine, bundle: s.bundle, view: nextView });
        setAppStatus(t("status.sessionRestored"), "ready");
        logger.info("session", "Slot continued", {
          slot: index,
          chapter: slotData.chapterId,
          node: nextView.node_id,
        });
        Profiler.event("session.slot_continued", `Slot ${index + 1}`, {
          chapter: slotData.chapterId,
          node: nextView.node_id,
        });
        logViewDiagnostics(nextView, "continue-slot");
      } catch (error: unknown) {
        setAppStatus(toErrorMessage(error), "error");
        logger.error("session", "Slot continue failed", error);
      } finally {
        commandPendingRef.current = false;
        setMenuLoading(false);
      }
    },
    [
      activeSlotRef,
      cancelAutosave,
      clearTransientUi,
      commandPendingRef,
      lastAutosaveRef,
      sessionRef,
      setAppStatus,
      setLastSavedAt,
      setMenuLoading,
      setSession,
      startAnalyticsSession,
      startPlaytimeClock,
      t,
    ],
  );

  const restartSlot = useCallback(
    async (index: number) => {
      const s = sessionRef.current;
      if (s.phase !== "selecting_slot" || commandPendingRef.current) return;
      const hadExistingSlot = readSlot(index) !== null;
      commandPendingRef.current = true;
      setMenuLoading(true);
      try {
        if (s.bundle.project) {
          await ensureChapterResident(s.bundle.project.startChapterId);
        }
        const nextEngine = createEngine(s.bundle, { freshStart: true });
        const nextView = readView(nextEngine);
        activeSlotRef.current = index;
        clearSlot(index);
        persistChapterCheckpoint({
          engine: nextEngine,
          nextView,
          activeSlotRef,
          lastAutosaveRef,
          setChapterTransition,
          takePlaytimeDelta,
          playtimeDeltaMs: 0,
          showTransition: false,
        });
        startPlaytimeClock();
        startAnalyticsSession(hadExistingSlot ? "slot_restart" : "new_game", nextView, 0);
        setSession({ phase: "ready", engine: nextEngine, bundle: s.bundle, view: nextView });
        setSavedState(null);
        setLastSavedAt(readSlot(activeSlotRef.current)?.savedAt ?? null);
        setAppStatus(t("status.online"), "ready");
        logger.info("session", "Slot restarted fresh", {
          slot: index,
          chapter: s.bundle.project?.startChapterId,
        });
        Profiler.event("session.slot_started", `Slot ${index + 1}`, {
          chapter: nextView.chapter_id,
          node: nextView.node_id,
        });
        logViewDiagnostics(nextView, "restart-slot");
      } catch (error: unknown) {
        reportBootError(t("errors.restartFailed"), error);
      } finally {
        commandPendingRef.current = false;
        setMenuLoading(false);
      }
    },
    [
      activeSlotRef,
      commandPendingRef,
      lastAutosaveRef,
      reportBootError,
      sessionRef,
      setAppStatus,
      setChapterTransition,
      setLastSavedAt,
      setMenuLoading,
      setSavedState,
      setSession,
      startAnalyticsSession,
      startPlaytimeClock,
      t,
      takePlaytimeDelta,
    ],
  );

  const restart = useCallback(async () => {
    const s = sessionRef.current;
    if (s.phase !== "ready") return;
    setChapterTransition(null);
    clearTransientUi();
    try {
      endAnalyticsSession("full_restart", s.view);
      if (s.bundle.project) {
        await ensureChapterResident(s.bundle.project.startChapterId);
      }
      const nextEngine = createEngine(s.bundle, { freshStart: true });
      const nextView = readView(nextEngine);
      clearSlot(activeSlotRef.current);
      persistChapterCheckpoint({
        engine: nextEngine,
        nextView,
        activeSlotRef,
        lastAutosaveRef,
        setChapterTransition,
        takePlaytimeDelta,
        playtimeDeltaMs: 0,
        showTransition: false,
      });
      startPlaytimeClock();
      startAnalyticsSession("full_restart", nextView, 0);
      setSession({ phase: "ready", engine: nextEngine, bundle: s.bundle, view: nextView });
      setSavedState(null);
      setLastSavedAt(readSlot(activeSlotRef.current)?.savedAt ?? null);
      setAppStatus(t("status.online"), "ready");
      logger.info("session", "Game restarted", {
        slot: activeSlotRef.current,
        chapter: s.bundle.project?.startChapterId,
      });
    } catch (error: unknown) {
      reportBootError(t("errors.restartFailed"), error);
    }
  }, [
    activeSlotRef,
    clearTransientUi,
    endAnalyticsSession,
    lastAutosaveRef,
    reportBootError,
    sessionRef,
    setAppStatus,
    setChapterTransition,
    setLastSavedAt,
    setSavedState,
    setSession,
    startAnalyticsSession,
    startPlaytimeClock,
    t,
    takePlaytimeDelta,
  ]);

  const returnToChapterStart = useCallback(async () => {
    const s = sessionRef.current;
    if (s.phase !== "ready" || commandPendingRef.current) return;
    const checkpoint = readSlot(activeSlotRef.current)?.chapterCheckpoint;
    if (!checkpoint?.state) {
      setAppStatus(t("errors.chapterCheckpointMissing"), "error");
      return;
    }

    cancelAutosave();
    clearTransientUi();
    endAnalyticsSession("chapter_restart", s.view);
    flushPlaytime();
    commandPendingRef.current = true;
    setCommandPending(true);
    try {
      const recovered = await rebuildEngineFromAutosave(
        s.bundle,
        checkpoint.state,
        checkpoint.chapterId,
      );
      const savedAt = writeSlot(
        activeSlotRef.current,
        checkpoint.state,
        checkpoint.chapterId,
        checkpoint.location,
      );
      if (savedAt) setLastSavedAt(savedAt);
      lastAutosaveRef.current = checkpoint.state;
      startAnalyticsSession(
        "chapter_restart",
        recovered.view,
        readSlot(activeSlotRef.current)?.totalPlaytimeMs ?? 0,
      );
      setSession({
        phase: "ready",
        engine: recovered.engine,
        bundle: recovered.bundle,
        view: recovered.view,
      });
      setAppStatus(t("status.chapterRestored"), "ready");
      logger.info("session", "Returned to chapter start", {
        slot: activeSlotRef.current,
        chapter: checkpoint.chapterId,
        node: recovered.view.node_id,
      });
    } catch (error: unknown) {
      setAppStatus(toErrorMessage(error), "error");
      logger.error("session", "Chapter checkpoint restore failed", error);
    } finally {
      commandPendingRef.current = false;
      setCommandPending(false);
    }
  }, [
    activeSlotRef,
    cancelAutosave,
    clearTransientUi,
    commandPendingRef,
    endAnalyticsSession,
    flushPlaytime,
    lastAutosaveRef,
    sessionRef,
    setAppStatus,
    setCommandPending,
    setLastSavedAt,
    setSession,
    startAnalyticsSession,
    t,
  ]);

  const goToMainMenu = useCallback(() => {
    const s = sessionRef.current;
    if (s.phase !== "ready") return;
    setChapterTransition(null);
    clearTransientUi();
    cancelAutosave();
    endAnalyticsSession("main_menu", s.view);
    flushPlaytime();
    playtimeStartedAtRef.current = null;
    commandPendingRef.current = false;
    setSession({
      phase: "selecting_slot",
      bundle: s.bundle,
      returnedFromSlot: activeSlotRef.current,
    });
    setSavedState(null);
    setLastSavedAt(null);
    setAppStatus(t("status.selectSlot"), "info");
    logger.info("session", "Returned to main menu");
  }, [
    activeSlotRef,
    cancelAutosave,
    clearTransientUi,
    commandPendingRef,
    endAnalyticsSession,
    flushPlaytime,
    playtimeStartedAtRef,
    sessionRef,
    setAppStatus,
    setChapterTransition,
    setLastSavedAt,
    setSavedState,
    setSession,
    t,
  ]);

  const save = useCallback((): string | null => {
    const s = sessionRef.current;
    if (s.phase !== "ready" || commandPendingRef.current) return null;
    cancelAutosave();
    const stateStr = serializeEngineState(s.engine);
    const savedAt = writeSlot(
      activeSlotRef.current,
      stateStr,
      s.view.chapter_id ?? null,
      s.view.title ?? s.view.chapter_title ?? null,
      takePlaytimeDelta(),
    );
    setSavedState(stateStr);
    if (savedAt) setLastSavedAt(savedAt);
    lastAutosaveRef.current = stateStr;
    setAppStatus(t("status.saved"), "ready");
    logger.info("session", "State saved", { slot: activeSlotRef.current });
    return stateStr;
  }, [
    activeSlotRef,
    cancelAutosave,
    commandPendingRef,
    lastAutosaveRef,
    sessionRef,
    setAppStatus,
    setLastSavedAt,
    setSavedState,
    t,
    takePlaytimeDelta,
  ]);

  const restore = useCallback(
    (stateJson: string) => {
      const s = sessionRef.current;
      if (s.phase !== "ready" || commandPendingRef.current) return;
      cancelAutosave();
      clearTransientUi();
      try {
        const nextView = restoreEngineState(s.engine, stateJson.trim());
        setSession({ ...s, view: nextView });
        setSavedState(stateJson);
        setLastSavedAt(null);
        lastAutosaveRef.current = stateJson.trim();
        setAppStatus(t("status.restored"), "ready");
        logger.info("session", t("status.restored"), { node: nextView.node_id });
      } catch (error: unknown) {
        setAppStatus(toErrorMessage(error), "error");
        logger.error("session", "State restore failed", error);
      }
    },
    [
      cancelAutosave,
      clearTransientUi,
      commandPendingRef,
      lastAutosaveRef,
      sessionRef,
      setAppStatus,
      setLastSavedAt,
      setSavedState,
      setSession,
      t,
    ],
  );

  return {
    continueSlot,
    restartSlot,
    restart,
    returnToChapterStart,
    goToMainMenu,
    save,
    restore,
  };
}
