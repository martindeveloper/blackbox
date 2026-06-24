import { diffDirtyKeys } from "@/lib/historyDiff.js";
import { notifyContributionApplied } from "@/lib/contributionNotifications.js";
import { buildAuthorDiff } from "@/lib/authorDiff.js";
import type { ProjectEvent } from "@/lib/projectApi.js";
import type { MediaCategory } from "@/lib/mediaLibrary.js";
import type { LoadedBundle } from "@/lib/scenarioLoader.js";
import type { ScenarioGet, ScenarioSet, HistorySnapshot } from "./types.js";

export const HISTORY_LIMIT = 100;
export const HISTORY_COALESCE_MS = 600;

export const runtime = {
  lastCommitLabel: null as string | null,
  lastCommitAt: 0,
  unsubscribeProject: null as (() => void) | null,
  contributionTimer: null as ReturnType<typeof setTimeout> | null,
};

export function cloneBundle(bundle: LoadedBundle): LoadedBundle {
  return structuredClone(bundle);
}

export function resetHistory(): { undoStack: HistorySnapshot[]; redoStack: HistorySnapshot[] } {
  runtime.lastCommitLabel = null;
  runtime.lastCommitAt = 0;
  return { undoStack: [], redoStack: [] };
}

export function applyHistorySnapshot(
  get: ScenarioGet,
  set: ScenarioSet,
  current: LoadedBundle,
  entry: HistorySnapshot,
  stacks: { undoStack: HistorySnapshot[]; redoStack: HistorySnapshot[] },
): void {
  const dirty = new Set(get().dirty);
  for (const key of diffDirtyKeys(current, entry.bundle)) dirty.add(key);
  runtime.lastCommitLabel = null;
  runtime.lastCommitAt = 0;
  set({
    bundle: entry.bundle,
    dirty,
    editVersion: get().editVersion + 1,
    narrativeVersion: get().narrativeVersion + 1,
    ...stacks,
  });
  get().runValidation();
}

export function presentContribution(
  event: ProjectEvent,
  set: ScenarioSet,
  get: ScenarioGet,
  before?: LoadedBundle | null,
  after?: LoadedBundle | null,
): void {
  if (event.contribution?.status !== "applied") return;
  if (runtime.contributionTimer) clearTimeout(runtime.contributionTimer);
  set({ recentContribution: event });
  const diff = buildAuthorDiff(event, before, after);
  notifyContributionApplied(event, { diff });
  runtime.contributionTimer = setTimeout(() => {
    if (get().recentContribution?.revision === event.revision) {
      set({ recentContribution: null });
    }
  }, 5000);
}

export function pickMediaFile(category: MediaCategory): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = category === "textures" ? "image/*" : "audio/*";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
