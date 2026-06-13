import { useEffect, useMemo, useRef } from "react";
import type { SessionPhase } from "../engine/hooks/useBlackboxSession.js";
import { snapshotEngineState } from "../engine/lib/engine.js";
import type { RollRecord } from "../engine/types/game.js";
import { postPreviewMessage } from "@preview-mode";

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
  const readyNodeId = readySession?.view.node_id;
  const readyChapterId = readySession?.view.chapter_id;

  const engineSnapshot = useMemo(() => {
    if (!readyEngine) return undefined;
    return snapshotEngineState(readyEngine);
  }, [readyEngine, readyNodeId, readyChapterId]);

  useEffect(() => {
    if (sessionPhase === "loading" || readySentRef.current) return;
    readySentRef.current = true;
    postPreviewMessage({ type: "ready" });
  }, [sessionPhase]);

  useEffect(() => {
    if (!readySession) {
      postPreviewMessage({ type: "runtime-state", state: { phase: sessionPhase } });
      return;
    }

    postPreviewMessage({
      type: "runtime-state",
      state: {
        phase: "ready",
        engine: engineSnapshot,
        view: { ...readySession.view },
        lastRolls,
        presentationBaselineStats,
        presentationLocation,
      },
    });
  }, [
    engineSnapshot,
    lastRolls,
    presentationBaselineStats,
    presentationLocation,
    readySession,
    sessionPhase,
  ]);

  return null;
}
