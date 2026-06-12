import { useEffect } from "react";
import { loadHeatmap, type StoredAnalyticsMeta } from "../lib/toolsApi.js";
import { useScenarioStore } from "../store/useScenarioStore.js";
import { useAnalyticsStore } from "../store/useAnalyticsStore.js";

const FALLBACK_META: StoredAnalyticsMeta = {
  mode: "goals",
  goals: "ending",
  goalBudget: 0,
  maxStates: 0,
  threads: 0,
  heuristic: "graph",
};

export function useHeatmapHydration() {
  const projectId = useScenarioStore((s) => s.projectId);

  useEffect(() => {
    if (!projectId) {
      useAnalyticsStore.getState().clear();
      return;
    }
    let cancelled = false;
    void loadHeatmap(projectId)
      .then((res) => {
        if (cancelled) return;
        const store = useAnalyticsStore.getState();
        if (res.stored) {
          store.setSnapshot(
            projectId,
            { ...res.stored, meta: res.stored.meta ?? FALLBACK_META },
            res.path,
            res.stale,
            useScenarioStore.getState().narrativeVersion,
          );
        } else {
          store.clear();
        }
      })
      .catch(() => {
        if (!cancelled) useAnalyticsStore.getState().clear();
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);
}
