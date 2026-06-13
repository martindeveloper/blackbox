import { useCallback, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { TFunction } from "i18next";
import {
  EngineBusyError,
  isValidAutosaveJson,
  rebuildEngineFromAutosave,
  serializeEngineState,
  type BlackboxEngine,
  type StatusKind,
} from "../../lib/engine.js";
import { logger } from "../../lib/logger.js";
import { addSlotPlaytime, readSlot, writeSlot } from "../../lib/slots.js";
import type { GameView } from "../../types/game.js";
import type { ReadySession, SessionPhase } from "./types.js";

const AUTOSAVE_DEBOUNCE_MS = 500;

interface UseSessionAutosaveOptions {
  activeSlotRef: RefObject<number>;
  commandPendingRef: RefObject<boolean>;
  lastAutosaveRef: RefObject<string | null>;
  takePlaytimeDelta: () => number;
  setSession: Dispatch<SetStateAction<SessionPhase>>;
  setAppStatus: (message: string, kind?: StatusKind) => void;
  t: TFunction;
}

export function useSessionAutosave({
  activeSlotRef,
  commandPendingRef,
  lastAutosaveRef,
  takePlaytimeDelta,
  setSession,
  setAppStatus,
  t,
}: UseSessionAutosaveOptions) {
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveGenerationRef = useRef(0);

  const cancelAutosave = useCallback(() => {
    autosaveGenerationRef.current += 1;
    if (!autosaveTimerRef.current) return;
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  }, []);

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
    [activeSlotRef, commandPendingRef, lastAutosaveRef, takePlaytimeDelta],
  );

  const recoverFromAutosave = useCallback(
    async (s: ReadySession, reason: string, context: Record<string, unknown>): Promise<boolean> => {
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
    [activeSlotRef, setAppStatus, setSession, t],
  );

  return { cancelAutosave, persistAutosave, recoverFromAutosave };
}
