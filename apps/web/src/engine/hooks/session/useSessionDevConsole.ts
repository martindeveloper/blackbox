import { useCallback } from "react";
import {
  debugAddItem,
  debugChangeChapter,
  debugGotoNode,
  debugKillPlayer,
  debugRemoveItem,
  toErrorMessage,
} from "../../lib/engine.js";
import type { DevConsoleCommand, DevConsoleResult } from "../../lib/devConsole.js";
import { logger } from "../../lib/logger.js";
import type { GameView } from "../../types/game.js";
import { commitSessionView } from "./commitSessionView.js";
import { finalizeChapterChange } from "./finalizeChapterChange.js";
import type { SessionPresentationAdapter } from "./types.js";
import type { SessionRuntime } from "./sessionRuntime.js";

export function useSessionDevConsole(
  runtime: SessionRuntime,
  presentation: SessionPresentationAdapter,
) {
  const { refs, actions, t } = runtime;
  const { sessionRef, commandPendingRef, notificationIdRef, activeSlotRef, lastAutosaveRef } = refs;
  const {
    setCommandPending,
    setSession,
    setPresentationBaselineStats,
    setPresentationLocation,
    setResolutionEpoch,
    setNotifications,
    setChapterTransition,
    setAppStatus,
    cancelAutosave,
    clearTransientUi,
    persistAutosave,
    takePlaytimeDelta,
  } = actions;

  return useCallback(
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
        commitSessionView({
          previousView,
          nextView,
          presentation,
          notificationIdRef,
          setPresentationBaselineStats,
          setPresentationLocation,
          setResolutionEpoch,
          setSession,
          setNotifications,
          alwaysAnimatePresentation: true,
          mergeNotifications: false,
        });

        if (chapterChanged && nextView.chapter_id) {
          await finalizeChapterChange({
            engine: s.engine,
            previousChapterId: previousView.chapter_id,
            previousView,
            nextView,
            hasProject: Boolean(s.bundle.project),
            activeSlotRef,
            lastAutosaveRef,
            setChapterTransition,
            takePlaytimeDelta,
          });
        }

        persistAutosave(s.engine, nextView);
        setAppStatus(t("status.devCommandApplied"), "ready");
        logger.warn("dev-console", "Applied runtime command", { command, node: nextView.node_id });

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
      activeSlotRef,
      cancelAutosave,
      clearTransientUi,
      commandPendingRef,
      lastAutosaveRef,
      notificationIdRef,
      persistAutosave,
      presentation,
      sessionRef,
      setAppStatus,
      setChapterTransition,
      setCommandPending,
      setNotifications,
      setPresentationBaselineStats,
      setPresentationLocation,
      setResolutionEpoch,
      setSession,
      t,
      takePlaytimeDelta,
    ],
  );
}
