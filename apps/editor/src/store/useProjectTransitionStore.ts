import { create } from "zustand";

const OPEN_MS = 420;
const CLOSE_MS = 400;
const OPEN_ACTION_AT_MS = 170;
const CLOSE_ACTION_AT_MS = 160;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export type ProjectTransitionPhase = "idle" | "opening" | "closing";

interface ProjectTransitionState {
  phase: ProjectTransitionPhase;
  runOpening: (action: () => void | Promise<void>) => Promise<void>;
  runClosing: (action: () => void | Promise<void>) => Promise<void>;
}

export const useProjectTransitionStore = create<ProjectTransitionState>((set, get) => ({
  phase: "idle",

  runOpening: async (action) => {
    if (get().phase !== "idle") {
      await action();
      return;
    }
    if (prefersReducedMotion()) {
      await action();
      return;
    }

    set({ phase: "opening" });
    await delay(OPEN_ACTION_AT_MS);
    await action();
    await delay(OPEN_MS - OPEN_ACTION_AT_MS);
    set({ phase: "idle" });
  },

  runClosing: async (action) => {
    if (get().phase !== "idle") {
      await action();
      return;
    }
    if (prefersReducedMotion()) {
      await action();
      return;
    }

    set({ phase: "closing" });
    await delay(CLOSE_ACTION_AT_MS);
    await action();
    await delay(CLOSE_MS - CLOSE_ACTION_AT_MS);
    set({ phase: "idle" });
  },
}));
