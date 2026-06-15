import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Hammer, Loader2 } from "lucide-react";
import { formatRelativeTime } from "../../lib/format.js";
import { useEditorSearch } from "../../lib/routeHelpers.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { useToolRunnerStore } from "../../store/useToolRunnerStore.js";
import type { BuildToolName, ToolBuildResult, ToolInfo } from "../../lib/toolsApi.js";
import { buildTool, discoverTools } from "../../lib/toolsApi.js";
import { TOOL_ITEMS } from "./ToolsSidebar.js";
import { EmptyState } from "../ui/EmptyState.js";

interface ToolBadgeProps {
  info: ToolInfo | null;
  label: string;
  toolName: BuildToolName;
  projectId: string | null;
  buildEnabled: boolean;
  onBuilt: () => void;
}

function ToolBadge({ info, label, toolName, projectId, buildEnabled, onBuilt }: ToolBadgeProps) {
  const { t } = useTranslation();
  const [building, setBuilding] = useState(false);
  const [buildResult, setBuildResult] = useState<ToolBuildResult | null>(null);

  const handleBuild = useCallback(async () => {
    if (!projectId || building) return;
    setBuilding(true);
    setBuildResult(null);
    try {
      const result = await buildTool(projectId, toolName);
      setBuildResult(result);
      if (result.ok) onBuilt();
    } catch (error) {
      setBuildResult({
        ok: false,
        results: [],
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBuilding(false);
    }
  }, [projectId, toolName, building, onBuilt]);

  const entry = buildResult?.results?.[0];
  const buildFailed = buildResult && !buildResult.ok;

  return (
    <div className="tools-inspector-tool">
      <span className="tools-inspector-tool-label">{label}</span>
      <div className="tools-inspector-tool-detail">
        {info && !info.available && (
          <span className="tools-inspector-tool-error">{info.error ?? t("tools.unavailable")}</span>
        )}
        {info?.version && <span className="tools-inspector-tool-version">{info.version}</span>}
        {info?.source && info.source !== "bundle" && (
          <span
            className={`tools-inspector-tool-source tools-inspector-tool-source--${info.source}`}
          >
            {t(`tools.source.${info.source}`)}
          </span>
        )}
        {buildFailed && entry && (
          <span className="tools-inspector-tool-error" title={entry.raw?.stderr ?? ""}>
            {t("tools.buildFailed", { code: entry.exitCode })}
          </span>
        )}
        {projectId && buildEnabled ? (
          <button
            className="tools-inspector-build-btn"
            onClick={() => void handleBuild()}
            disabled={building}
            title={t("tools.buildTool", { label })}
          >
            {building ? (
              <Loader2 size={11} className="tools-inspector-build-spin" />
            ) : (
              <Hammer size={11} />
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ToolsInspector() {
  const { t } = useTranslation();
  const { tool } = useEditorSearch();
  const activeTool = tool ?? "linter";
  const config = TOOL_ITEMS.find((item) => item.id === activeTool);
  const projectName = useScenarioStore((s) => s.projectName);
  const projectId = useScenarioStore((s) => s.projectId);
  const projectPath = useScenarioStore((s) => s.projectPath);
  const discovery = useToolRunnerStore((s) => s.discovery);
  const setDiscovery = useToolRunnerStore((s) => s.setDiscovery);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!discovery?.updatedAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, [discovery?.updatedAt]);

  const handleBuilt = useCallback(() => {
    if (!projectId) return;
    void discoverTools(projectId).then(setDiscovery);
  }, [projectId, setDiscovery]);

  if (!config) {
    return <EmptyState>{t("tools.inspector.selectTool")}</EmptyState>;
  }

  const scenarioFile = projectPath ? "scenario.json" : null;

  return (
    <div className="tools-inspector">
      <dl className="tools-inspector-meta">
        <div>
          <dt>{t("tools.inspector.project")}</dt>
          <dd>{projectName ?? t("app.noProject")}</dd>
        </div>
        {scenarioFile && (
          <div>
            <dt>{t("tools.inspector.manifestFile")}</dt>
            <dd className="font-mono text-[10px]">{scenarioFile}</dd>
          </div>
        )}
      </dl>

      <div className="tools-inspector-tools">
        <div className="tools-inspector-tools-header">
          <span className="tools-inspector-tools-heading">{t("tools.inspector.toolsHeading")}</span>
          {discovery?.updatedAt && (
            <span className="tools-inspector-tools-updated">
              {formatRelativeTime(discovery.updatedAt)}
            </span>
          )}
        </div>
        {TOOL_ITEMS.map((item) => (
          <ToolBadge
            key={item.id}
            info={
              item.id === "linter"
                ? (discovery?.linter ?? null)
                : item.id === "bundle"
                  ? (discovery?.bundler ?? null)
                  : (discovery?.simulator ?? null)
            }
            label={t(item.labelKey)}
            toolName={
              item.id === "simulator" ? "simulator" : item.id === "bundle" ? "bundler" : "linter"
            }
            projectId={projectId}
            buildEnabled={discovery?.buildEnabled ?? true}
            onBuilt={handleBuilt}
          />
        ))}
      </div>
    </div>
  );
}
