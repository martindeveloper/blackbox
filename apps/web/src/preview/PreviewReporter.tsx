import { useCallback, useEffect, useMemo, useRef } from "react";
import type { SessionPhase } from "../engine/hooks/useBlackboxSession.js";
import { snapshotEngineState } from "../engine/lib/engine.js";
import type { RollRecord } from "../engine/types/game.js";
import { postPreviewMessage } from "@preview-mode";
import { setPreviewRuntimeStatePublisher } from "./runtimeStatePublisher.js";

export interface PreviewReporterProps {
  session: SessionPhase;
  lastRolls: RollRecord[];
  presentationBaselineStats: Record<string, number>;
  presentationLocation: string | undefined;
}

export function PreviewReporter({
  session,
  lastRolls,
  presentationBaselineStats,
  presentationLocation,
}: PreviewReporterProps) {
  const readySentRef = useRef(false);
  const sessionPhase = session.phase;
  const readySession = sessionPhase === "ready" ? session : null;
  const readyEngine = readySession?.engine;

  const engineSnapshot = useMemo(() => {
    if (!readyEngine) return undefined;
    return snapshotEngineState(readyEngine);
  }, [readyEngine, readySession?.view]);

  const publishRuntimeState = useCallback(
    (forceEngineSnapshot = false) => {
      if (!readySession) {
        postPreviewMessage({ type: "runtime-state", state: { phase: sessionPhase } });
        return;
      }

      postPreviewMessage({
        type: "runtime-state",
        state: {
          phase: "ready",
          engine: forceEngineSnapshot ? snapshotEngineState(readySession.engine) : engineSnapshot,
          view: { ...readySession.view },
          lastRolls,
          presentationBaselineStats,
          presentationLocation,
        },
      });
    },
    [
      engineSnapshot,
      lastRolls,
      presentationBaselineStats,
      presentationLocation,
      readySession,
      sessionPhase,
    ],
  );

  useEffect(() => {
    if (sessionPhase === "loading" || readySentRef.current) return;
    readySentRef.current = true;
    postPreviewMessage({ type: "ready" });
  }, [sessionPhase]);

  useEffect(() => {
    publishRuntimeState();
  }, [publishRuntimeState]);

  useEffect(() => {
    setPreviewRuntimeStatePublisher(() => publishRuntimeState(true));
    return () => setPreviewRuntimeStatePublisher(null);
  }, [publishRuntimeState]);

  return null;
}
