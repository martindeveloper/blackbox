import { Flame, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { deleteHeatmap, SIM_GOALS_PRESETS } from "../../lib/toolsApi.js";
import { useAnalyticsStore, type StoredAnalyticsMeta } from "../../store/useAnalyticsStore.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { Icon } from "../icons/Icon.js";

function formatSimCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function targetLabel(meta: StoredAnalyticsMeta, t: (key: string) => string): string {
  if (SIM_GOALS_PRESETS.includes(meta.goals as (typeof SIM_GOALS_PRESETS)[number])) {
    if (meta.goals === "ending") return t("tools.simulator.goalsEnding");
    if (meta.goals === "game_over") return t("tools.simulator.goalsGameOver");
    return t("tools.simulator.goalsAll");
  }
  return meta.goals || t("tools.simulator.goalsCustom");
}

function SettingChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="tools-heatstore-chip">
      <span className="tools-heatstore-chip-label">{label}</span>
      <span className="tools-heatstore-chip-value">{value}</span>
    </span>
  );
}

interface StoredHeatmapCardProps {
  compact?: boolean;
}

export function StoredHeatmapCard({ compact = false }: StoredHeatmapCardProps) {
  const { t, i18n } = useTranslation();
  const analytics = useAnalyticsStore((s) => s.analytics);
  const meta = useAnalyticsStore((s) => s.meta);
  const capturedAt = useAnalyticsStore((s) => s.capturedAt);
  const analyticsProjectId = useAnalyticsStore((s) => s.projectId);
  const storedPath = useAnalyticsStore((s) => s.path);
  const persistedStale = useAnalyticsStore((s) => s.stale);
  const analyticsNarrativeVersion = useAnalyticsStore((s) => s.narrativeVersion);
  const scenarioRevision = useAnalyticsStore((s) => s.scenarioRevision);
  const clear = useAnalyticsStore((s) => s.clear);
  const projectId = useScenarioStore((s) => s.projectId);
  const narrativeVersion = useScenarioStore((s) => s.narrativeVersion);
  const stale =
    persistedStale ||
    (analyticsNarrativeVersion !== null && analyticsNarrativeVersion !== narrativeVersion);

  if (!analytics || !meta || !capturedAt || analyticsProjectId !== projectId) return null;

  const handleRemove = () => {
    clear();
    if (projectId) void deleteHeatmap(projectId).catch(() => {});
  };

  const datetime = new Date(capturedAt).toLocaleString(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const modeLabel =
    meta.mode === "goals" ? t("tools.simulator.modeGoals") : t("tools.simulator.modeExplore");

  return (
    <section
      className={`tools-heatstore${compact ? " tools-heatstore--compact" : ""}`}
      title={compact ? (storedPath ?? undefined) : undefined}
    >
      <span className="tools-heatstore-icon" aria-hidden>
        <Icon icon={Flame} size={15} strokeWidth={2.2} />
      </span>
      <div className="tools-heatstore-body">
        <div className="tools-heatstore-head">
          <span className="tools-heatstore-heading">
            <span className="tools-heatstore-title">
              {compact
                ? t("tools.simulator.heatStore.compactTitle")
                : t("tools.simulator.heatStore.title", { datetime })}
            </span>
            {compact && <span className="tools-heatstore-date">{datetime}</span>}
          </span>
          <span className="tools-heatstore-totals">
            {t("tools.simulator.heatStore.totals", {
              paths: formatSimCount(analytics.totalPaths),
              endings: analytics.totalEndings,
            })}
          </span>
        </div>
        <div className="tools-heatstore-chips">
          {stale && (
            <SettingChip
              label={t("tools.simulator.heatStore.status")}
              value={t("tools.simulator.heatStore.stale")}
            />
          )}
          <SettingChip label={t("tools.simulator.mode")} value={modeLabel} />
          {!compact && scenarioRevision && (
            <SettingChip label={t("tools.simulator.heatStore.revision")} value={scenarioRevision} />
          )}
          {meta.mode === "goals" ? (
            <>
              <SettingChip label={t("tools.simulator.goals")} value={targetLabel(meta, t)} />
              <SettingChip
                label={t("tools.simulator.goalBudget")}
                value={formatSimCount(meta.goalBudget)}
              />
              {!compact && (
                <SettingChip
                  label={t("tools.simulator.heuristic")}
                  value={
                    meta.heuristic === "graph"
                      ? t("tools.simulator.heuristicGraph")
                      : t("tools.simulator.heuristicNone")
                  }
                />
              )}
            </>
          ) : (
            <SettingChip
              label={t("tools.simulator.maxStates")}
              value={formatSimCount(meta.maxStates)}
            />
          )}
          {!compact && (
            <SettingChip
              label={t("tools.simulator.threads")}
              value={meta.threads > 0 ? String(meta.threads) : t("tools.simulator.threadsAuto")}
            />
          )}
        </div>
        {stale && (
          <span className="tools-heatstore-warning">
            {t("tools.simulator.heatStore.staleWarning")}
          </span>
        )}
        {!compact && storedPath && (
          <span className="tools-heatstore-path" title={storedPath}>
            {storedPath}
          </span>
        )}
      </div>
      <button
        type="button"
        className="tools-heatstore-remove"
        title={t("tools.simulator.heatStore.removeTitle")}
        aria-label={t("tools.simulator.heatStore.removeTitle")}
        onClick={handleRemove}
      >
        <Icon icon={Trash2} size={12} strokeWidth={2.2} />
        {!compact && t("tools.simulator.heatStore.remove")}
      </button>
    </section>
  );
}
