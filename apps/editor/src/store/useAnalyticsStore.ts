import { create } from "zustand";
import type { SimAnalytics, StoredAnalyticsMeta, StoredHeatmap } from "../lib/toolsApi.js";

export type { StoredAnalyticsMeta };

interface AnalyticsStore {
  analytics: SimAnalytics | null;
  meta: StoredAnalyticsMeta | null;
  projectId: string | null;
  capturedAt: number | null;
  path: string | null;
  stale: boolean;
  version: number | null;
  sourceRevision: number | null;
  scenarioRevision: string | null;
  runId: string | null;
  narrativeVersion: number | null;
  setSnapshot: (
    projectId: string,
    stored: StoredHeatmap,
    path: string | null,
    stale: boolean,
    narrativeVersion: number,
  ) => void;
  clear: () => void;
}

export const useAnalyticsStore = create<AnalyticsStore>((set) => ({
  analytics: null,
  meta: null,
  projectId: null,
  capturedAt: null,
  path: null,
  stale: false,
  version: null,
  sourceRevision: null,
  scenarioRevision: null,
  runId: null,
  narrativeVersion: null,
  setSnapshot: (projectId, stored, path, stale, narrativeVersion) =>
    set({
      analytics: stored.analytics,
      meta: stored.meta,
      projectId,
      capturedAt: stored.capturedAt,
      path,
      stale,
      version: stored.version,
      sourceRevision: stored.sourceRevision,
      scenarioRevision: stored.scenarioRevision,
      runId: stored.runId,
      narrativeVersion,
    }),
  clear: () =>
    set({
      analytics: null,
      meta: null,
      projectId: null,
      capturedAt: null,
      path: null,
      stale: false,
      version: null,
      sourceRevision: null,
      scenarioRevision: null,
      runId: null,
      narrativeVersion: null,
    }),
}));
