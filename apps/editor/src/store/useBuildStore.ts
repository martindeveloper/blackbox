import { create } from "zustand";
import { appendLogLine } from "../../shared/logBuffer.js";
import type {
  BuildCapabilities,
  BuildConfiguration,
  BuildEvent,
  BuildPlatform,
  BuildRunSnapshot,
  BuildStage,
} from "../lib/buildApi.js";
import { getBuildCapabilities, stagesForPlatform } from "../lib/buildApi.js";

interface BuildStore {
  platform: BuildPlatform;
  configuration: BuildConfiguration;
  selectedStages: BuildStage[];
  run: BuildRunSnapshot | null;
  log: string[];
  capabilities: BuildCapabilities | null;
  preflightLoading: boolean;
  preflightError: string | null;
  setPlatform: (platform: BuildPlatform) => void;
  setConfiguration: (configuration: BuildConfiguration) => void;
  toggleStage: (stage: BuildStage) => void;
  refreshPreflight: (projectId: string) => Promise<void>;
  applyEvent: (event: BuildEvent) => void;
}

function allStages(platform: BuildPlatform): BuildStage[] {
  return stagesForPlatform(platform);
}

export const useBuildStore = create<BuildStore>((set, get) => ({
  platform: "web",
  configuration: "release",
  selectedStages: stagesForPlatform("web"),
  run: null,
  log: [],
  capabilities: null,
  preflightLoading: false,
  preflightError: null,

  setPlatform: (platform) =>
    set({
      platform,
      selectedStages: get().selectedStages.filter((stage) => allStages(platform).includes(stage)),
    }),

  setConfiguration: (configuration) => set({ configuration }),

  toggleStage: (stage) => {
    const current = get().selectedStages;
    const next = current.includes(stage) ? current.filter((s) => s !== stage) : [...current, stage];
    const ordered = allStages(get().platform).filter((s) => next.includes(s));
    set({ selectedStages: ordered });
  },

  refreshPreflight: async (projectId) => {
    set({ preflightLoading: true, preflightError: null });
    try {
      const capabilities = await getBuildCapabilities(projectId);
      set({ capabilities, preflightLoading: false, preflightError: null });
    } catch (error) {
      set({
        preflightLoading: false,
        preflightError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  applyEvent: (event) => {
    if (event.type === "snapshot") {
      set({ run: event.current?.run ?? null, log: event.current?.log ?? [] });
      return;
    }
    if (event.type === "started") {
      set({ run: event.run, log: [] });
      return;
    }
    if (event.type === "log") {
      const log = [...get().log];
      appendLogLine(log, event.line);
      set({ log });
      return;
    }
    if (event.type === "stage") {
      const run = get().run;
      if (!run) return;
      set({
        run: {
          ...run,
          stages: run.stages.map((s) =>
            s.stage === event.stage
              ? { ...s, state: event.state, artifact: event.artifact ?? s.artifact }
              : s,
          ),
        },
      });
      return;
    }
    if (event.type === "done") {
      set({ run: event.run });
    }
  },
}));
