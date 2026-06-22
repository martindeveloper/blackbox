import type { ScenarioGet, ScenarioSet, ScenarioState } from "./types.js";
import {
  cloneBundle,
  applyHistorySnapshot,
  runtime,
  HISTORY_LIMIT,
  HISTORY_COALESCE_MS,
} from "./helpers.js";

export function createHistoryActions(
  set: ScenarioSet,
  get: ScenarioGet,
): Pick<ScenarioState, "commitHistory" | "undo" | "redo"> {
  return {
    commitHistory: (label, coalesce = true) => {
      const { bundle, undoStack } = get();
      if (!bundle) return;
      const now = Date.now();
      if (
        coalesce &&
        undoStack.length > 0 &&
        runtime.lastCommitLabel === label &&
        now - runtime.lastCommitAt < HISTORY_COALESCE_MS
      ) {
        runtime.lastCommitAt = now;
        return;
      }
      const nextStack = [...undoStack, { label, bundle: cloneBundle(bundle) }];
      if (nextStack.length > HISTORY_LIMIT) nextStack.shift();
      runtime.lastCommitLabel = label;
      runtime.lastCommitAt = now;
      set({ undoStack: nextStack, redoStack: [] });
    },

    undo: () => {
      const { undoStack, redoStack, bundle } = get();
      if (undoStack.length === 0 || !bundle) return;
      const entry = undoStack[undoStack.length - 1]!;
      applyHistorySnapshot(get, set, bundle, entry, {
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, { label: entry.label, bundle }],
      });
    },

    redo: () => {
      const { undoStack, redoStack, bundle } = get();
      if (redoStack.length === 0 || !bundle) return;
      const entry = redoStack[redoStack.length - 1]!;
      applyHistorySnapshot(get, set, bundle, entry, {
        undoStack: [...undoStack, { label: entry.label, bundle }],
        redoStack: redoStack.slice(0, -1),
      });
    },
  };
}
