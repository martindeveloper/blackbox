import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type BlackboxEngine,
  bootEngine,
  commandErrorMessage,
  createEngine,
  debugAddItem,
  debugChangeChapter,
  debugGotoNode,
  debugKillPlayer,
  debugRemoveItem,
  EngineBusyError,
  ensureChaptersForCommand,
  handleChapterTransition,
  isOfferedChoiceRejected,
  isValidAutosaveJson,
  isWasmRuntimeFailure,
  makeBootError,
  readView,
  rebuildEngineFromAutosave,
  restoreEngineState,
  retryUnknownNodeCommand,
  serializeEngineState,
  submitCommand,
  toErrorMessage,
  type StatusKind,
} from "../lib/engine.js";
import type { DevConsoleCommand, DevConsoleResult } from "../lib/devConsole.js";
import { analytics } from "../lib/vercelAnalytics.js";
import { bundleStore } from "../lib/bundleStore.js";
import {
  addSlotPlaytime,
  clearSlot,
  readSlot,
  writeChapterCheckpoint,
  writeSlot,
} from "../lib/slots.js";
import { logger } from "../lib/logger.js";
import { logViewDiagnostics } from "../lib/viewDiagnostics.js";
import { rollStatusFailed, rollStatusSummary } from "../lib/rolls.js";
import type {
  CommandResult,
  GameView,
  ItemExamineView,
  RollRecord,
  ScenarioBundle,
  SfxCue,
  UiNotification,
} from "../types/game.js";

export type SessionPhase =
  | { phase: "loading" }
  | { phase: "selecting_slot"; bundle: ScenarioBundle; returnedFromSlot?: number }
  | { phase: "ready"; engine: BlackboxEngine; bundle: ScenarioBundle; view: GameView }
  | { phase: "error"; message: string };

const AUTOSAVE_DEBOUNCE_MS = 500;

export interface SessionPresentationAdapter {
  collectStateNotifications: (
    previous: GameView,
    current: GameView,
    nextId: () => number,
  ) => UiNotification[];
  rollRevealDelayMs: (rollCount: number) => number;
  chapterTransitionMs: number;
}

interface UseBlackboxSessionOptions {
  presentation: SessionPresentationAdapter;
  onSfx?: (sfx: SfxCue) => void;
}

export function useBlackboxSession({ onSfx, presentation }: UseBlackboxSessionOptions) {
  const { t } = useTranslation();
  const onSfxRef = useRef(onSfx);
  onSfxRef.current = onSfx;

  const [session, setSession] = useState<SessionPhase>({ phase: "loading" });
  const sessionRef = useRef<SessionPhase>(session);
  sessionRef.current = session;

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
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveGenerationRef = useRef(0);
  const lastAutosaveRef = useRef<string | null>(null);
  const activeSlotRef = useRef(0);
  const playtimeStartedAtRef = useRef<number | null>(null);
  const analyticsSessionStartedAtRef = useRef<number | null>(null);
  const analyticsSessionEndedRef = useRef(true);
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

  const cancelAutosave = useCallback(() => {
    autosaveGenerationRef.current += 1;
    if (!autosaveTimerRef.current) return;
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  }, []);

  const startPlaytimeClock = useCallback(() => {
    playtimeStartedAtRef.current = Date.now();
  }, []);

  const takePlaytimeDelta = useCallback(() => {
    const now = Date.now();
    const startedAt = playtimeStartedAtRef.current;
    playtimeStartedAtRef.current = now;
    return startedAt === null ? 0 : Math.max(0, now - startedAt);
  }, []);

  const flushPlaytime = useCallback(() => {
    if (playtimeStartedAtRef.current === null) return;
    addSlotPlaytime(activeSlotRef.current, takePlaytimeDelta());
  }, [takePlaytimeDelta]);

  const currentTotalPlaytimeMs = useCallback(() => {
    const persisted = readSlot(activeSlotRef.current)?.totalPlaytimeMs ?? 0;
    const startedAt = playtimeStartedAtRef.current;
    return persisted + (startedAt === null ? 0 : Math.max(0, Date.now() - startedAt));
  }, []);

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

  const persistAutosave = useCallback(
    (engine: BlackboxEngine, mode: GameView["mode"], chapterId?: string) => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      const generation = autosaveGenerationRef.current;
      autosaveTimerRef.current = setTimeout(() => {
        autosaveTimerRef.current = null;
        if (generation !== autosaveGenerationRef.current) return;
        if (commandPendingRef.current) {
          persistAutosave(engine, mode, chapterId);
          return;
        }
        try {
          if (mode === "normal") {
            const stateStr = serializeEngineState(engine);
            if (!isValidAutosaveJson(stateStr)) {
              logger.error("session", "Skipped autosave — serialize returned invalid JSON", {
                preview: stateStr.slice(0, 80),
              });
              return;
            }
            if (stateStr === lastAutosaveRef.current) {
              logger.debug("session", "Skipped autosave — state unchanged");
              return;
            }
            writeSlot(
              activeSlotRef.current,
              stateStr,
              chapterId ?? null,
              null,
              takePlaytimeDelta(),
            );
            lastAutosaveRef.current = stateStr;
            logger.debug("session", "Autosaved to slot", {
              slot: activeSlotRef.current,
              chapterId,
              mode,
            });
          } else {
            addSlotPlaytime(activeSlotRef.current, takePlaytimeDelta());
            logger.debug("session", "Kept last safe autosave (terminal node)", {
              slot: activeSlotRef.current,
              mode,
            });
          }
        } catch (error: unknown) {
          if (error instanceof EngineBusyError) {
            logger.debug("session", "Autosave deferred (engine busy)");
            persistAutosave(engine, mode, chapterId);
            return;
          }
          logger.error("session", "Autosave failed", error);
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [takePlaytimeDelta],
  );

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

  const recoverFromAutosave = useCallback(
    async (
      s: Extract<SessionPhase, { phase: "ready" }>,
      reason: string,
      context: Record<string, unknown>,
    ): Promise<boolean> => {
      const slotData = readSlot(activeSlotRef.current);
      const autosave = slotData?.state ?? null;
      if (!autosave?.trim() || !isValidAutosaveJson(autosave)) {
        logger.error("session", "Autosave recovery unavailable", {
          reason,
          slot: activeSlotRef.current,
          hasAutosave: Boolean(autosave),
          autosaveValid: autosave ? isValidAutosaveJson(autosave) : false,
          ...context,
        });
        return false;
      }

      try {
        const recovered = await rebuildEngineFromAutosave(s.bundle, autosave, slotData?.chapterId);
        setSession({
          phase: "ready",
          engine: recovered.engine,
          bundle: recovered.bundle,
          view: recovered.view,
        });
        setAppStatus(t("status.engineRecovered"), "info");
        logger.warn("session", "Recovered session from slot autosave", {
          reason,
          slot: activeSlotRef.current,
          node: recovered.view.node_id,
          ...context,
        });
        return true;
      } catch (restoreError: unknown) {
        logger.error("session", "Autosave recovery failed", { reason, restoreError, ...context });
        return false;
      }
    },
    [setAppStatus, t],
  );

  const applyCommandResult = useCallback(
    (
      result: CommandResult,
      fallback: string,
      engine: BlackboxEngine,
      previousView: GameView,
      command: Parameters<typeof submitCommand>[1],
    ): boolean => {
      if (!result.ok || !result.view) {
        const msg = commandErrorMessage(result, fallback);
        setAppStatus(msg, "error");
        logger.error("session", "Command failed", { msg, result });
        return false;
      }

      const resultView = result.view;
      setPresentationBaselineStats({ ...previousView.player_stats });

      const rolls = result.rolls ?? [];
      const nodeChanged = resultView.node_id !== previousView.node_id;
      const nextNotifications = presentation.collectStateNotifications(
        previousView,
        resultView,
        () => {
          notificationIdRef.current += 1;
          return notificationIdRef.current;
        },
      );
      if (rolls.length > 0 || nextNotifications.length > 0) {
        setPresentationLocation(previousView.title ?? previousView.node_id);
        setResolutionEpoch((epoch) => epoch + 1);
      } else {
        setPresentationLocation(undefined);
      }

      setSession((prev) => {
        if (prev.phase !== "ready") return prev;
        return { ...prev, view: resultView };
      });

      setLastRolls(rolls);
      setNotifications((current) => [...(nodeChanged ? [] : current), ...nextNotifications]);

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
        // No check on this transition — clear any pending reveal and reset the
        // status indicator so a previous node's pass/fail message doesn't linger.
        if (rollStatusTimerRef.current) {
          clearTimeout(rollStatusTimerRef.current);
          rollStatusTimerRef.current = null;
        }
        setAppStatus(t("status.online"), "ready");
      }
      if (result.selected_sfx) playSfxSafe(result.selected_sfx, "Choice");
      if (result.triggered_sfx) playSfxSafe(result.triggered_sfx, "Triggered");

      if (command.type === "choose") {
        const selectedChoice = previousView.choices.find(
          (choice) => choice.id === command.choice_id,
        );
        analytics.track("Choice Selected", {
          chapter_id: previousView.chapter_id,
          source_node: previousView.node_id,
          choice_id: command.choice_id,
          destination_node: resultView.node_id,
          has_check: Boolean(selectedChoice?.check),
          result_mode: resultView.mode,
        });
      } else if (command.type === "useItem") {
        analytics.track("Item Used", {
          chapter_id: previousView.chapter_id,
          node_id: previousView.node_id,
          item_id: command.item_ref,
          action_id: command.action_id,
        });
      }

      rolls.forEach((roll, index) => {
        if (roll.kind !== "skillCheck") return;
        analytics.track("Skill Check", {
          chapter_id: previousView.chapter_id,
          node_id: previousView.node_id,
          choice_id: command.type === "choose" ? command.choice_id : undefined,
          stat: roll.stat,
          difficulty: roll.difficulty,
          success: roll.success,
          roll_mode: roll.rollMode ?? "normal",
          result_index: index,
        });
      });

      if (result.chapter_changed) {
        const stateStr = serializeEngineState(engine);
        writeChapterCheckpoint(
          activeSlotRef.current,
          stateStr,
          resultView.chapter_id ?? null,
          resultView.title ?? resultView.node_id,
          takePlaytimeDelta(),
        );
        lastAutosaveRef.current = stateStr;
        if (resultView.chapter_title) {
          setChapterTransition(resultView.chapter_title);
        }
        logger.info(
          "session",
          `Chapter entered: ${resultView.chapter_title ?? resultView.chapter_id}`,
        );
        analytics.track("Chapter Entered", {
          chapter_id: resultView.chapter_id,
          source_chapter_id: previousView.chapter_id,
          node_id: resultView.node_id,
        });
      }

      if (resultView.mode === "game_over" || resultView.mode === "ending") {
        const totalPlaytimeMs = currentTotalPlaytimeMs();
        const terminalProperties = {
          chapter_id: resultView.chapter_id,
          source_node: previousView.node_id,
          terminal_node: resultView.node_id,
          choice_id: command.type === "choose" ? command.choice_id : undefined,
          total_playtime_seconds: Math.floor(totalPlaytimeMs / 1000),
        };
        if (resultView.mode === "game_over") {
          analytics.track("Player Died", terminalProperties);
        } else {
          analytics.track("Ending Reached", terminalProperties);
        }
        endAnalyticsSession(resultView.mode, resultView, totalPlaytimeMs);
      }

      logger.debug("session", `-> ${resultView.node_id}`, { mode: resultView.mode });
      logViewDiagnostics(resultView, "command");
      persistAutosave(engine, resultView.mode, resultView.chapter_id);
      return true;
    },
    [
      currentTotalPlaytimeMs,
      endAnalyticsSession,
      persistAutosave,
      playSfxSafe,
      presentation,
      setAppStatus,
      t,
      takePlaytimeDelta,
    ],
  );

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
          const applied = applyCommandResult(result, fallback, s.engine, s.view, command);

          if (
            applied &&
            result.ok &&
            result.chapter_changed &&
            result.view?.chapter_id &&
            s.bundle.project
          ) {
            setChapterLoading(true);
            try {
              await handleChapterTransition(s.engine, previousChapterId, result.view.chapter_id);
              setChapterLoadingDone(true);
            } finally {
              setChapterLoading(false);
            }
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
    [applyCommandResult, cancelAutosave, clearTransientUi, recoverFromAutosave, setAppStatus],
  );

  const executeDevCommand = useCallback(
    async (command: DevConsoleCommand): Promise<DevConsoleResult> => {
      const s = sessionRef.current;
      if (s.phase !== "ready") {
        return { ok: false, message: "No active game session." };
      }
      if (commandPendingRef.current) {
        return { ok: false, message: "Engine is busy." };
      }
      if (command.type === "help" || command.type === "clear") {
        return { ok: true, message: command.type };
      }

      cancelAutosave();
      clearTransientUi();
      commandPendingRef.current = true;
      setCommandPending(true);
      const previousView = s.view;

      try {
        let nextView: GameView;
        switch (command.type) {
          case "goto":
          case "ending":
            // `ending` shares goto's navigation; the resolved mode is asserted
            // after the view commits so the engine and UI never desync.
            nextView = await debugGotoNode(s.engine, command.nodeId);
            break;
          case "chapter_change":
            nextView = await debugChangeChapter(s.engine, command.chapterId, command.nodeId);
            break;
          case "item_add":
            nextView = debugAddItem(s.engine, command.itemRef, command.count);
            break;
          case "item_remove":
            nextView = debugRemoveItem(s.engine, command.itemRef, command.count);
            break;
          case "death":
            nextView = debugKillPlayer(s.engine);
            break;
        }

        const chapterChanged = previousView.chapter_id !== nextView.chapter_id;
        setPresentationBaselineStats({ ...previousView.player_stats });
        const nextNotifications = presentation.collectStateNotifications(
          previousView,
          nextView,
          () => {
            notificationIdRef.current += 1;
            return notificationIdRef.current;
          },
        );
        setNotifications(nextNotifications);
        setPresentationLocation(previousView.title ?? previousView.node_id);
        setResolutionEpoch((epoch) => epoch + 1);
        setSession({ phase: "ready", engine: s.engine, bundle: s.bundle, view: nextView });

        if (chapterChanged && nextView.chapter_id) {
          const stateStr = serializeEngineState(s.engine);
          writeChapterCheckpoint(
            activeSlotRef.current,
            stateStr,
            nextView.chapter_id,
            nextView.title ?? nextView.node_id,
            takePlaytimeDelta(),
          );
          lastAutosaveRef.current = stateStr;
          if (nextView.chapter_title) setChapterTransition(nextView.chapter_title);
          if (s.bundle.project) {
            await handleChapterTransition(s.engine, previousView.chapter_id, nextView.chapter_id);
          }
        }

        persistAutosave(s.engine, nextView.mode, nextView.chapter_id);
        setAppStatus(t("status.devCommandApplied"), "ready");
        logger.warn("dev-console", "Applied runtime command", { command, node: nextView.node_id });

        // `ending` is goto with a guard: surface a clear failure when the
        // target node does not actually resolve to an ending screen.
        if (command.type === "ending" && nextView.mode !== "ending") {
          return {
            ok: false,
            message: `'${command.nodeId}' resolved to mode '${nextView.mode}', not an ending`,
          };
        }

        return {
          ok: true,
          message:
            command.type === "item_add" || command.type === "item_remove"
              ? `${command.itemRef}: ${nextView.inventory[command.itemRef] ?? 0}`
              : `${nextView.chapter_id ?? "scenario"} / ${nextView.node_id}`,
        };
      } catch (error) {
        const message = toErrorMessage(error);
        setAppStatus(message, "error");
        logger.error("dev-console", "Runtime command failed", { command, error });
        return { ok: false, message };
      } finally {
        commandPendingRef.current = false;
        setCommandPending(false);
      }
    },
    [
      cancelAutosave,
      clearTransientUi,
      persistAutosave,
      presentation,
      setAppStatus,
      t,
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
          await bundleStore.ensureChapter(chapterId);
        }
        const engine = createEngine(s.bundle);
        const nextView = restoreEngineState(engine, slotData.state.trim());
        activeSlotRef.current = index;
        lastAutosaveRef.current = slotData.state.trim();
        startPlaytimeClock();
        startAnalyticsSession("continue", nextView, slotData.totalPlaytimeMs);
        setSession({ phase: "ready", engine, bundle: s.bundle, view: nextView });
        setAppStatus(t("status.sessionRestored"), "ready");
        logger.info("session", "Slot continued", {
          slot: index,
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
    [cancelAutosave, clearTransientUi, setAppStatus, startAnalyticsSession, startPlaytimeClock, t],
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
          await bundleStore.ensureChapter(s.bundle.project.startChapterId);
        }
        const nextEngine = createEngine(s.bundle, { freshStart: true });
        const nextView = readView(nextEngine);
        const stateStr = serializeEngineState(nextEngine);
        activeSlotRef.current = index;
        lastAutosaveRef.current = stateStr;
        clearSlot(index);
        writeChapterCheckpoint(
          index,
          stateStr,
          nextView.chapter_id ?? s.bundle.project?.startChapterId ?? null,
          nextView.title ?? nextView.node_id ?? null,
        );
        startPlaytimeClock();
        startAnalyticsSession(hadExistingSlot ? "slot_restart" : "new_game", nextView, 0);
        setSession({ phase: "ready", engine: nextEngine, bundle: s.bundle, view: nextView });
        setSavedState(null);
        setAppStatus(t("status.online"), "ready");
        logger.info("session", "Slot restarted fresh", {
          slot: index,
          chapter: s.bundle.project?.startChapterId,
        });
        logViewDiagnostics(nextView, "restart-slot");
      } catch (error: unknown) {
        reportBootError(t("errors.restartFailed"), error);
      } finally {
        commandPendingRef.current = false;
        setMenuLoading(false);
      }
    },
    [reportBootError, setAppStatus, startAnalyticsSession, startPlaytimeClock, t],
  );

  const restart = useCallback(async () => {
    const s = sessionRef.current;
    if (s.phase !== "ready") return;
    setChapterTransition(null);
    clearTransientUi();
    try {
      endAnalyticsSession("full_restart", s.view);
      if (s.bundle.project) {
        await bundleStore.ensureChapter(s.bundle.project.startChapterId);
      }
      const nextEngine = createEngine(s.bundle, { freshStart: true });
      const nextView = readView(nextEngine);
      const stateStr = serializeEngineState(nextEngine);
      lastAutosaveRef.current = stateStr;
      clearSlot(activeSlotRef.current);
      writeChapterCheckpoint(
        activeSlotRef.current,
        stateStr,
        nextView.chapter_id ?? s.bundle.project?.startChapterId ?? null,
        nextView.title ?? nextView.node_id ?? null,
      );
      startPlaytimeClock();
      startAnalyticsSession("full_restart", nextView, 0);
      setSession({ phase: "ready", engine: nextEngine, bundle: s.bundle, view: nextView });
      setSavedState(null);
      setAppStatus(t("status.online"), "ready");
      logger.info("session", "Game restarted", {
        slot: activeSlotRef.current,
        chapter: s.bundle.project?.startChapterId,
      });
    } catch (error: unknown) {
      reportBootError(t("errors.restartFailed"), error);
    }
  }, [
    clearTransientUi,
    endAnalyticsSession,
    reportBootError,
    setAppStatus,
    startAnalyticsSession,
    startPlaytimeClock,
    t,
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
      writeSlot(activeSlotRef.current, checkpoint.state, checkpoint.chapterId, checkpoint.location);
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
    cancelAutosave,
    clearTransientUi,
    endAnalyticsSession,
    flushPlaytime,
    setAppStatus,
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
    setAppStatus(t("status.selectSlot"), "info");
    logger.info("session", "Returned to main menu");
  }, [cancelAutosave, clearTransientUi, endAnalyticsSession, flushPlaytime, setAppStatus, t]);

  const save = useCallback((): string | null => {
    const s = sessionRef.current;
    if (s.phase !== "ready" || commandPendingRef.current) return null;
    cancelAutosave();
    const stateStr = serializeEngineState(s.engine);
    setSavedState(stateStr);
    setAppStatus(t("status.saved"), "ready");
    logger.info("session", "State saved");
    return stateStr;
  }, [cancelAutosave, setAppStatus, t]);

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
        lastAutosaveRef.current = stateJson.trim();
        setAppStatus(t("status.restored"), "ready");
        logger.info("session", t("status.restored"), { node: nextView.node_id });
      } catch (error: unknown) {
        setAppStatus(toErrorMessage(error), "error");
        logger.error("session", "State restore failed", error);
      }
    },
    [cancelAutosave, clearTransientUi, setAppStatus, t],
  );

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
