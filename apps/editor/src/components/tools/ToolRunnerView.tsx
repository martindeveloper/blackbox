import {
  ChevronDown,
  ChevronRight,
  FileWarning,
  ListChecks,
  Loader2,
  Play,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useToolRunner } from "../../hooks/useToolRunner.js";
import { translate } from "../../lib/i18n.js";
import { Page } from "../../lib/pages.js";
import { editorNavigate, useEditorSearch } from "../../lib/routeHelpers.js";
import type { ToolId } from "../../lib/routeHelpers.js";
import type {
  BundleToolResult,
  LintOptions,
  SimOptions,
  StoredAnalyticsMeta,
  ToolResult,
} from "../../lib/toolsApi.js";
import {
  DEFAULT_SIM_OPTIONS,
  isCompleteSimulatorOutput,
  LINT_CATEGORIES,
  saveHeatmap,
} from "../../lib/toolsApi.js";
import { toolDiscoveryInfo, useToolRunnerStore } from "../../store/useToolRunnerStore.js";
import { useAnalyticsStore } from "../../store/useAnalyticsStore.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { Icon } from "../icons/Icon.js";
import { Button } from "../ui/Button.js";
import { Checkbox } from "../ui/Checkbox.js";
import { ParsedOutput } from "./ParsedOutput.js";
import { SimulatorOptionsPanel } from "./SimulatorOptionsPanel.js";
import { StoredHeatmapCard } from "./StoredHeatmapCard.js";
import { ToolOptionToggle } from "./ToolOptionToggle.js";

interface ToolRunnerViewProps {
  toolId: ToolId;
  title: string;
  icon: LucideIcon;
  commandLabel: string;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder.toFixed(0)}s`;
}

function combineOutput(result: ToolResult | BundleToolResult): string {
  const chunks: string[] = [];
  if (result.raw.stdout.trim()) chunks.push(result.raw.stdout.trimEnd());
  if (!result.ok && result.raw.stderr.trim()) chunks.push(result.raw.stderr.trimEnd());
  if (result.error) chunks.push(result.error);
  if (chunks.length === 0) {
    return result.ok
      ? translate("tools.noOutput")
      : translate("tools.exitCodeDetail", { code: result.exitCode });
  }
  return chunks.join("\n\n");
}

function LintFilterPanel({
  filterMode,
  selectedIds,
  onFilterModeChange,
  onToggleId,
  disabled,
}: {
  filterMode: "only" | "ignore";
  selectedIds: Set<string>;
  onFilterModeChange: (mode: "only" | "ignore") => void;
  onToggleId: (id: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleExpanded = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  return (
    <div className="tools-filter-panel">
      <div className="tools-filter-mode">
        <label className="tools-filter-mode-option">
          <input
            type="radio"
            name="lint-filter-mode"
            value="ignore"
            checked={filterMode === "ignore"}
            onChange={() => onFilterModeChange("ignore")}
            disabled={disabled}
          />
          <span>{t("tools.linter.filterIgnore")}</span>
        </label>
        <label className="tools-filter-mode-option">
          <input
            type="radio"
            name="lint-filter-mode"
            value="only"
            checked={filterMode === "only"}
            onChange={() => onFilterModeChange("only")}
            disabled={disabled}
          />
          <span>{t("tools.linter.filterOnly")}</span>
        </label>
      </div>

      <ul className="tools-filter-categories">
        {LINT_CATEGORIES.map((cat) => {
          const isExpanded = expandedCategories.has(cat.id);
          return (
            <li key={cat.id} className="tools-filter-category">
              <div className="tools-filter-category-row">
                <button
                  type="button"
                  className="tools-filter-expand"
                  onClick={() => toggleExpanded(cat.id)}
                  aria-expanded={isExpanded}
                  disabled={disabled}
                >
                  <Icon icon={isExpanded ? ChevronDown : ChevronRight} size={12} />
                </button>
                <Checkbox
                  label={t(`tools.linter.categoryLabels.${cat.id}`)}
                  checked={selectedIds.has(cat.id)}
                  onChange={() => onToggleId(cat.id)}
                  disabled={disabled}
                />
              </div>
              {isExpanded && (
                <ul className="tools-filter-rules">
                  {cat.rules.map((ruleId) => (
                    <li key={ruleId} className="tools-filter-rule">
                      <Checkbox
                        label={ruleId}
                        checked={selectedIds.has(ruleId)}
                        onChange={() => onToggleId(ruleId)}
                        disabled={disabled}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ToolRunnerView({ toolId, title, icon, commandLabel }: ToolRunnerViewProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { run: autoRun } = useEditorSearch();
  const autoRunTriggered = useRef(false);
  const [ignoreMissing, setIgnoreMissing] = useState(false);
  const [lintAll, setLintAll] = useState(true);
  const [filterMode, setFilterMode] = useState<"only" | "ignore">("ignore");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [simOptions, setSimOptions] = useState<SimOptions>(DEFAULT_SIM_OPTIONS);

  const lintOptions = useMemo<LintOptions>(() => {
    if (lintAll || toolId !== "linter") return { only: [], ignore: [] };
    const ids = [...selectedIds];
    return filterMode === "only" ? { only: ids, ignore: [] } : { only: [], ignore: ids };
  }, [lintAll, toolId, filterMode, selectedIds]);

  const {
    projectName,
    runState,
    elapsedMs,
    result,
    toolRun,
    configError,
    canRun,
    configReady,
    run,
  } = useToolRunner(toolId, ignoreMissing, lintOptions, simOptions);

  const setToolRunState = useToolRunnerStore((s) => s.setToolRunState);
  const setSnapshot = useAnalyticsStore((s) => s.setSnapshot);
  const discovery = useToolRunnerStore((s) => s.discovery);
  const toolInfo = toolDiscoveryInfo(discovery, toolId);
  const toolUnavailable = toolInfo !== null && !toolInfo.available;

  useEffect(() => {
    setToolRunState(toolId, runState);
    return () => {
      if (useToolRunnerStore.getState().activeTool === toolId) {
        setToolRunState(null, "idle");
      }
    };
  }, [toolId, runState, setToolRunState]);

  useEffect(() => {
    autoRunTriggered.current = false;
  }, [toolId, autoRun]);

  useEffect(() => {
    if (
      toolId !== "simulator" ||
      toolRun?.tool !== "simulator" ||
      toolRun.request?.storeAnalytics !== true ||
      runState !== "done"
    ) {
      return;
    }
    const parsed = result?.parsed;
    if (!parsed || !isCompleteSimulatorOutput(parsed) || !parsed.analytics) return;
    const projectId = useScenarioStore.getState().projectId;
    if (!projectId) return;

    const analytics = parsed.analytics;
    const request = toolRun.request;
    const meta: StoredAnalyticsMeta = {
      mode: request.mode,
      goals: request.goals,
      goalBudget: request.goalBudget,
      maxStates: request.maxStates,
      threads: request.threads,
      heuristic: request.heuristic,
    };
    const capturedAt = toolRun.completedAt ?? Date.now();
    const sourceRevision = request.expectedRevision;
    const scenarioRevision = parsed.revision;
    let cancelled = false;

    void saveHeatmap(projectId, {
      analytics,
      meta,
      capturedAt,
      sourceRevision,
      scenarioRevision,
      runId: toolRun.id,
    })
      .then((res) => {
        if (!cancelled && res.stored) {
          setSnapshot(
            projectId,
            res.stored,
            res.path,
            res.stale,
            useScenarioStore.getState().narrativeVersion,
          );
        }
      })
      .catch(() => {
        // Persisting failed (e.g. read-only project) — keep the heat map usable in-memory.
        if (!cancelled) {
          setSnapshot(
            projectId,
            {
              version: 2,
              analytics,
              meta,
              capturedAt,
              contentFingerprint: null,
              sourceRevision,
              scenarioRevision,
              runId: toolRun.id,
            },
            null,
            false,
            useScenarioStore.getState().narrativeVersion,
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [toolId, toolRun, runState, result, setSnapshot]);

  useEffect(() => {
    if (!autoRun || autoRunTriggered.current || !configReady || !canRun || runState !== "idle") {
      return;
    }
    autoRunTriggered.current = true;
    void run();
    void editorNavigate(navigate, {
      to: Page.EditorTools,
      search: { tool: toolId },
      replace: true,
    });
  }, [autoRun, canRun, configReady, navigate, run, runState, toolId]);

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const output = result ? combineOutput(result) : "";
  const statusLabel =
    runState === "running"
      ? t("tools.status.running")
      : runState === "done"
        ? t("tools.status.passed")
        : runState === "error"
          ? t("tools.status.failed")
          : t("tools.status.ready");
  const runTimestamp = toolRun?.completedAt ?? toolRun?.startedAt ?? null;
  const runDatetime = runTimestamp
    ? new Date(runTimestamp).toLocaleString(i18n.language, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="tools-runner">
      <header className="tools-runner-header">
        <span className="tools-runner-icon">
          <Icon icon={icon} size={15} strokeWidth={2} />
        </span>
        <h1 className="tools-runner-title">{title}</h1>
        <span className="tools-runner-header-spacer" />
        {runDatetime && runTimestamp && (
          <span className="tools-run-date" title={new Date(runTimestamp).toISOString()}>
            {toolRun?.state === "running"
              ? t("tools.startedAt", { datetime: runDatetime })
              : t("tools.lastRunAt", { datetime: runDatetime })}
          </span>
        )}
        <span className={`tools-status tools-status--${runState}`}>{statusLabel}</span>
        {(runState === "running" || result) && (
          <span className="tools-elapsed">{formatElapsed(elapsedMs)}</span>
        )}
      </header>

      <div className="tools-runner-bar">
        <Button
          variant="primary"
          leadingIcon={runState === "running" ? Loader2 : Play}
          disabled={!canRun || runState === "running" || toolUnavailable}
          className={runState === "running" ? "tools-run-btn--spin" : undefined}
          onClick={() => void run()}
        >
          {runState === "running" ? t("tools.running") : t("tools.run", { command: commandLabel })}
        </Button>
        {toolUnavailable ? (
          <span className="tools-run-blocker">
            {toolInfo?.error ?? t("tools.binaryNotAvailable")}
          </span>
        ) : !projectName ? (
          <span className="tools-run-blocker">{t("tools.openProject")}</span>
        ) : configError ? (
          <span className="tools-run-blocker">{configError}</span>
        ) : (
          <span className="tools-runner-target">
            <span className="tools-runner-target-name">{projectName}</span>
          </span>
        )}
      </div>

      {(toolId === "bundle" || toolId === "linter") && (
        <div className="tools-basic-options">
          <span className="tools-sim-section-label">{t("tools.optionsLabel")}</span>
          <div className="tools-basic-options-grid">
            {toolId === "bundle" && (
              <ToolOptionToggle
                icon={FileWarning}
                label={t("tools.bundle.ignoreMissing")}
                hint={t("tools.bundle.ignoreMissingHint")}
                title={t("tools.bundle.ignoreMissingFlag")}
                checked={ignoreMissing}
                onChange={setIgnoreMissing}
                disabled={runState === "running"}
              />
            )}
            {toolId === "linter" && (
              <ToolOptionToggle
                icon={ListChecks}
                label={t("tools.linter.lintAll")}
                hint={t("tools.linter.lintAllHint")}
                checked={lintAll}
                onChange={setLintAll}
                disabled={runState === "running"}
              />
            )}
          </div>
        </div>
      )}

      {toolId === "linter" && !lintAll && (
        <LintFilterPanel
          filterMode={filterMode}
          selectedIds={selectedIds}
          onFilterModeChange={setFilterMode}
          onToggleId={toggleId}
          disabled={runState === "running"}
        />
      )}

      {toolId === "simulator" && (
        <SimulatorOptionsPanel
          options={simOptions}
          onChange={setSimOptions}
          disabled={runState === "running"}
          aside={<StoredHeatmapCard compact />}
        />
      )}

      <section className="tools-output-shell" aria-live="polite">
        {runState === "running" ? (
          <div className="tools-output-loading">
            <Icon icon={Loader2} size={14} className="tools-spinner" />
            <span>{t("tools.waiting")}</span>
          </div>
        ) : result ? (
          <ParsedOutput result={result} rawText={output} />
        ) : (
          <p className="tools-output-empty">{t("tools.outputEmpty")}</p>
        )}
      </section>
    </div>
  );
}
