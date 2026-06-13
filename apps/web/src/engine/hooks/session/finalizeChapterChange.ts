import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  handleChapterTransition,
  serializeEngineState,
  type BlackboxEngine,
} from "../../lib/engine.js";
import { logger } from "../../lib/logger.js";
import { Profiler } from "../../lib/profiler.js";
import { writeChapterCheckpoint } from "../../lib/slots.js";
import type { GameView } from "../../types/game.js";

export interface PersistChapterCheckpointParams {
  engine: BlackboxEngine;
  nextView: GameView;
  activeSlotRef: RefObject<number>;
  lastAutosaveRef: RefObject<string | null>;
  setChapterTransition: Dispatch<SetStateAction<string | null>>;
  takePlaytimeDelta: () => number;
  playtimeDeltaMs?: number;
  showTransition?: boolean;
}

export function persistChapterCheckpoint({
  engine,
  nextView,
  activeSlotRef,
  lastAutosaveRef,
  setChapterTransition,
  takePlaytimeDelta,
  playtimeDeltaMs,
  showTransition = true,
}: PersistChapterCheckpointParams): void {
  const stateStr = serializeEngineState(engine);
  writeChapterCheckpoint(
    activeSlotRef.current,
    stateStr,
    nextView.chapter_id ?? null,
    nextView.title ?? nextView.node_id,
    playtimeDeltaMs ?? takePlaytimeDelta(),
  );
  lastAutosaveRef.current = stateStr;
  if (showTransition && nextView.chapter_title) {
    setChapterTransition(nextView.chapter_title);
  }
}

export interface FinalizeChapterChangeParams extends PersistChapterCheckpointParams {
  previousChapterId: string | undefined;
  previousView?: GameView;
  hasProject: boolean;
  onTransitionStart?: () => void;
  onTransitionEnd?: () => void;
}

export async function finalizeChapterChange({
  engine,
  previousChapterId,
  previousView,
  nextView,
  hasProject,
  onTransitionStart,
  onTransitionEnd,
  ...checkpointParams
}: FinalizeChapterChangeParams): Promise<void> {
  if (previousView) {
    Profiler.event("session.chapter_changed", nextView.chapter_id, {
      from: previousView.chapter_id,
      title: nextView.chapter_title,
    });
    logger.info("session", `Chapter entered: ${nextView.chapter_title ?? nextView.chapter_id}`);
  }

  persistChapterCheckpoint({ engine, nextView, ...checkpointParams });

  if (!hasProject || !nextView.chapter_id) return;

  onTransitionStart?.();
  try {
    await handleChapterTransition(engine, previousChapterId, nextView.chapter_id);
  } finally {
    onTransitionEnd?.();
  }
}
