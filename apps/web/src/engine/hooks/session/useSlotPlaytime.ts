import { useCallback, useRef, type RefObject } from "react";
import { addSlotPlaytime, readSlot } from "../../lib/slots.js";

export function useSlotPlaytime(activeSlotRef: RefObject<number>) {
  const playtimeStartedAtRef = useRef<number | null>(null);

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
  }, [activeSlotRef, takePlaytimeDelta]);

  const currentTotalPlaytimeMs = useCallback(() => {
    const persisted = readSlot(activeSlotRef.current)?.totalPlaytimeMs ?? 0;
    const startedAt = playtimeStartedAtRef.current;
    return persisted + (startedAt === null ? 0 : Math.max(0, Date.now() - startedAt));
  }, [activeSlotRef]);

  return {
    playtimeStartedAtRef,
    startPlaytimeClock,
    takePlaytimeDelta,
    flushPlaytime,
    currentTotalPlaytimeMs,
  };
}
