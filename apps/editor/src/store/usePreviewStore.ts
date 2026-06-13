import { create } from "zustand";
import {
  PREVIEW_PROFILER_HISTORY_LIMIT,
  type PreviewHostCommand,
  type PreviewProfilerEvent,
  type PreviewRuntimeState,
  type PreviewStorageState,
} from "../../shared/previewProtocol.js";

export type PreviewCommandSender = (command: PreviewHostCommand) => void;

export type { PreviewProfilerEvent, PreviewRuntimeState, PreviewStorageState, PreviewHostCommand };

interface PreviewStore {
  connected: boolean;
  runtimeState: PreviewRuntimeState;
  storageState: PreviewStorageState;
  profilerEvents: PreviewProfilerEvent[];
  setConnected: (connected: boolean) => void;
  setRuntimeState: (runtimeState: PreviewRuntimeState) => void;
  setStorageState: (storageState: PreviewStorageState) => void;
  addProfilerEvent: (event: PreviewProfilerEvent) => void;
  setProfilerEvents: (events: PreviewProfilerEvent[]) => void;
  commandSender: PreviewCommandSender | null;
  setCommandSender: (commandSender: PreviewCommandSender | null) => void;
  reset: () => void;
}

export const usePreviewStore = create<PreviewStore>((set) => ({
  connected: false,
  runtimeState: { phase: "loading" },
  storageState: {},
  profilerEvents: [],
  setConnected: (connected) => set({ connected }),
  setRuntimeState: (runtimeState) => set({ runtimeState }),
  setStorageState: (storageState) => set({ storageState }),
  addProfilerEvent: (event) =>
    set((state) => ({
      profilerEvents: [...state.profilerEvents, event].slice(-PREVIEW_PROFILER_HISTORY_LIMIT),
    })),
  setProfilerEvents: (profilerEvents) =>
    set({ profilerEvents: profilerEvents.slice(-PREVIEW_PROFILER_HISTORY_LIMIT) }),
  commandSender: null,
  setCommandSender: (commandSender) => set({ commandSender }),
  reset: () =>
    set({
      connected: false,
      runtimeState: { phase: "loading" },
      storageState: {},
      profilerEvents: [],
    }),
}));
