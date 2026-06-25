import { create } from "zustand";
import {
  PREVIEW_CONSOLE_HISTORY_LIMIT,
  PREVIEW_PROFILER_HISTORY_LIMIT,
  type PreviewConsoleEntry,
  type PreviewProfilerEvent,
  type PreviewRuntimeState,
  type PreviewStorageState,
} from "@players/web/protocol.js";
import { PreviewCommandError } from "./previewCommandErrors.js";
import { cancelPreviewRpc, type PreviewCommandSender } from "./previewCommandRpc.js";

export type {
  PreviewConsoleEntry,
  PreviewProfilerEvent,
  PreviewRuntimeState,
  PreviewStorageState,
  PreviewHostCommand,
  PreviewCheckpointPayload,
} from "@players/web/protocol.js";

export type {
  PreviewCommandSender,
  PreviewRpcCommand,
  PreviewRpcSuccess,
} from "./previewCommandRpc.js";

export { PreviewCommandError, previewCommandErrorMessage } from "./previewCommandErrors.js";
export {
  requestPreviewCommand,
  finishPreviewRpcResult,
  cancelPreviewRpc,
} from "./previewCommandRpc.js";

interface PreviewStore {
  connected: boolean;
  runtimeState: PreviewRuntimeState;
  storageState: PreviewStorageState;
  profilerEvents: PreviewProfilerEvent[];
  profilerClearedAt: number;
  consoleEntries: PreviewConsoleEntry[];
  setConnected: (connected: boolean) => void;
  setRuntimeState: (runtimeState: PreviewRuntimeState) => void;
  setStorageState: (storageState: PreviewStorageState) => void;
  addProfilerEvent: (event: PreviewProfilerEvent) => void;
  setProfilerEvents: (events: PreviewProfilerEvent[]) => void;
  clearProfilerEvents: () => void;
  addConsoleEntry: (entry: PreviewConsoleEntry) => void;
  setConsoleEntries: (entries: PreviewConsoleEntry[]) => void;
  commandSender: PreviewCommandSender | null;
  setCommandSender: (commandSender: PreviewCommandSender | null) => void;
  reset: () => void;
}

function newestProfilerEvents(events: PreviewProfilerEvent[]): PreviewProfilerEvent[] {
  return [...events]
    .sort((a, b) => b.at - a.at || b.id - a.id)
    .slice(0, PREVIEW_PROFILER_HISTORY_LIMIT);
}

function afterProfilerClear(
  events: PreviewProfilerEvent[],
  profilerClearedAt: number,
): PreviewProfilerEvent[] {
  if (profilerClearedAt <= 0) return events;
  return events.filter((event) => event.at > profilerClearedAt);
}

export const usePreviewStore = create<PreviewStore>((set) => ({
  connected: false,
  runtimeState: { phase: "loading" },
  storageState: {},
  profilerEvents: [],
  profilerClearedAt: 0,
  consoleEntries: [],
  setConnected: (connected) => set({ connected }),
  setRuntimeState: (runtimeState) => set({ runtimeState }),
  setStorageState: (storageState) => set({ storageState }),
  addProfilerEvent: (event) =>
    set((state) => {
      if (event.at <= state.profilerClearedAt) return {};
      return { profilerEvents: newestProfilerEvents([...state.profilerEvents, event]) };
    }),
  setProfilerEvents: (profilerEvents) =>
    set((state) => ({
      profilerEvents: newestProfilerEvents(
        afterProfilerClear(profilerEvents, state.profilerClearedAt),
      ),
    })),
  clearProfilerEvents: () => set({ profilerEvents: [], profilerClearedAt: Date.now() }),
  addConsoleEntry: (entry) =>
    set((state) => ({
      consoleEntries: [...state.consoleEntries, entry].slice(-PREVIEW_CONSOLE_HISTORY_LIMIT),
    })),
  setConsoleEntries: (consoleEntries) =>
    set({ consoleEntries: consoleEntries.slice(-PREVIEW_CONSOLE_HISTORY_LIMIT) }),
  commandSender: null,
  setCommandSender: (commandSender) => set({ commandSender }),
  reset: () => {
    cancelPreviewRpc(new PreviewCommandError("cancelled"));
    set({
      connected: false,
      runtimeState: { phase: "loading" },
      storageState: {},
      profilerEvents: [],
      profilerClearedAt: 0,
      consoleEntries: [],
    });
  },
}));
