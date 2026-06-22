import { Activity } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { analyzeNarrative } from "@/lib/narrativeAnalysis.js";
import { useScenarioStore } from "@/store/useScenarioStore.js";
import { Icon } from "@/components/icons/Icon.js";

export function NarrativeInsightsPanel() {
  const { t } = useTranslation();
  const bundle = useScenarioStore((s) => s.bundle);
  const narrativeVersion = useScenarioStore((s) => s.narrativeVersion);

  const metrics = useMemo(
    () => (bundle ? analyzeNarrative(bundle) : null),
    // narrativeVersion bumps whenever the bundle is structurally edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bundle, narrativeVersion],
  );

  if (!bundle || !metrics) return null;

  return (
    <section className="dashboard-panel" aria-labelledby="dashboard-insights">
      <div className="dashboard-panel-header" id="dashboard-insights">
        <span className="editor-btn-content">
          <Icon icon={Activity} size={14} />
          {t("insights.title")}
        </span>
        <span className="dashboard-insights-subtitle">{t("insights.subtitle")}</span>
      </div>

      <div className="dashboard-stats-row dashboard-insights-metrics">
        <div className="dashboard-stat">
          <strong>{metrics.totalNodes.toLocaleString()}</strong>
          <span>{t("insights.metric.nodes")}</span>
        </div>
        <div className="dashboard-stat">
          <strong>{metrics.totalChoices.toLocaleString()}</strong>
          <span>{t("insights.metric.choices")}</span>
        </div>
        <div className="dashboard-stat">
          <strong>{metrics.endings.toLocaleString()}</strong>
          <span>{t("insights.metric.endings")}</span>
        </div>
        <div className="dashboard-stat">
          <strong>{metrics.avgBranching.toFixed(1)}</strong>
          <span>{t("insights.metric.branching")}</span>
        </div>
      </div>

      <details className="dashboard-insights-pacing">
        <summary>{t("insights.pacingTitle")}</summary>
        <table className="dashboard-pacing-table">
          <thead>
            <tr>
              <th>{t("insights.pacingChapter")}</th>
              <th>{t("insights.pacingNodes")}</th>
              <th>{t("insights.pacingChoices")}</th>
              <th>{t("insights.pacingAvg")}</th>
              <th>{t("insights.pacingEndings")}</th>
            </tr>
          </thead>
          <tbody>
            {metrics.chapters.map((chapter) => (
              <tr key={chapter.chapterId}>
                <td title={chapter.chapterId}>{chapter.title}</td>
                <td>{chapter.nodeCount}</td>
                <td>{chapter.choiceCount}</td>
                <td>{chapter.avgChoices.toFixed(1)}</td>
                <td>{chapter.endingCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
