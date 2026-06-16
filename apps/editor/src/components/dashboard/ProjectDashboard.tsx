import {
  ArrowUpRight,
  BookOpen,
  Check,
  CircleAlert,
  Files,
  FolderOpen,
  Layers3,
  Package,
  Save,
  ShieldCheck,
  Users,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { collectDashboardStats } from "../../lib/dashboardStats.js";
import { Page } from "../../lib/pages.js";
import { editorNavigate, navigateToTool } from "../../lib/routeHelpers.js";
import { getToolRun, type ToolRun } from "../../lib/toolsApi.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { Icon } from "../icons/Icon.js";

interface WorkspaceLinkProps {
  title: string;
  meta: string;
  icon: LucideIcon;
  onClick: () => void;
}

function WorkspaceLink({ title, meta, icon, onClick }: WorkspaceLinkProps) {
  return (
    <button type="button" className="dashboard-workspace" onClick={onClick}>
      <span className="dashboard-workspace-icon" aria-hidden>
        <Icon icon={icon} size={15} strokeWidth={2} />
      </span>
      <span className="dashboard-workspace-copy">
        <span className="dashboard-workspace-title">{title}</span>
        <span className="dashboard-workspace-meta">{meta}</span>
      </span>
      <ArrowUpRight size={13} className="dashboard-workspace-arrow" aria-hidden />
    </button>
  );
}

interface PulseMetricProps {
  value: number;
  label: string;
}

function PulseMetric({ value, label }: PulseMetricProps) {
  return (
    <div className="dashboard-pulse-metric">
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </div>
  );
}

export function ProjectDashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const bundle = useScenarioStore((s) => s.bundle);
  const projectName = useScenarioStore((s) => s.projectName);
  const projectPath = useScenarioStore((s) => s.projectPath);
  const projectId = useScenarioStore((s) => s.projectId);
  const revision = useScenarioStore((s) => s.revision);
  const mediaFiles = useScenarioStore((s) => s.mediaFiles);
  const validationIssues = useScenarioStore((s) => s.validationIssues);
  const dirty = useScenarioStore((s) => s.dirty);
  const [lintRun, setLintRun] = useState<ToolRun | null>(null);
  const [lintProjectId, setLintProjectId] = useState(projectId);
  if (lintProjectId !== projectId) {
    setLintProjectId(projectId);
    setLintRun(null);
  }

  useEffect(() => {
    let cancelled = false;
    let timeout: number | null = null;

    const load = async () => {
      if (!projectId) {
        setLintRun(null);
        return;
      }
      try {
        const run = await getToolRun(projectId, "linter");
        if (cancelled) return;
        setLintRun(run);
        if (run?.state === "running") {
          timeout = window.setTimeout(() => void load(), 750);
        }
      } catch {
        if (!cancelled) setLintRun(null);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timeout !== null) window.clearTimeout(timeout);
    };
  }, [projectId]);

  const stats = useMemo(() => {
    if (!bundle) return null;
    return collectDashboardStats(bundle, mediaFiles, validationIssues, dirty.size);
  }, [bundle, mediaFiles, validationIssues, dirty.size]);

  if (!bundle || !stats) return null;

  const projectTitle = bundle.scenario.title ?? projectName;
  const startChapter = bundle.scenario.chapters[0]?.id ?? null;
  const startNode = startChapter ? bundle.chapters[startChapter]?.startNodeId : null;
  const issueCount = stats.validationErrors + stats.validationWarnings;
  const catalogCount = stats.textures + stats.music + stats.sfx;
  const storyDataCount = stats.events + stats.flags;
  const libraryCount = stats.snippets + stats.templates + stats.conditions;
  const healthTone =
    stats.validationErrors > 0 ? "error" : stats.validationWarnings > 0 ? "warn" : "ok";
  const lintParsed = lintRun?.result?.parsed?.kind === "lint" ? lintRun.result.parsed : null;
  const lintExecutionFailed = lintRun?.state === "error" && lintParsed === null;
  const lintIssueCount = lintParsed ? lintParsed.total.errors + lintParsed.total.warnings : null;
  const lintStale =
    lintRun !== null &&
    lintRun.state !== "running" &&
    (lintRun.request.expectedRevision !== revision || stats.unsavedDocs > 0);
  const lintTone =
    lintRun?.state === "running"
      ? "running"
      : lintExecutionFailed || (lintParsed?.total.errors ?? 0) > 0
        ? "error"
        : lintStale || (lintParsed?.total.warnings ?? 0) > 0
          ? "warn"
          : lintParsed
            ? "ok"
            : "idle";
  const lintCount =
    lintRun?.state === "running"
      ? "…"
      : lintExecutionFailed
        ? "!"
        : lintIssueCount === null
          ? "—"
          : lintIssueCount.toLocaleString();
  const lintCompletedAt = lintRun?.completedAt ?? null;
  const lintDatetime = lintCompletedAt
    ? new Date(lintCompletedAt).toLocaleString(i18n.language, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;
  const lintDetail =
    lintRun?.state === "running"
      ? t("dashboard.lint.running")
      : lintExecutionFailed
        ? t("dashboard.lint.failed")
        : lintParsed
          ? t("dashboard.stat.validationDetail", {
              errors: lintParsed.total.errors,
              warnings: lintParsed.total.warnings,
            })
          : t("dashboard.lint.neverRun");

  const openGraph = () =>
    void editorNavigate(navigate, {
      to: Page.EditorGraph,
      search: {
        chapter: startChapter,
        node: startNode,
        globalNode: null,
      },
    });

  return (
    <div className="dashboard-screen">
      <div className="dashboard-frame">
        <header className="dashboard-hero">
          <div className="dashboard-hero-copy">
            <p className="dashboard-eyebrow">{t("dashboard.eyebrow")}</p>
            <h1 className="dashboard-title">{projectTitle}</h1>
            <p className="dashboard-lead">{t("dashboard.briefing")}</p>
          </div>
          <div className="dashboard-project-id">
            <span>{projectName}</span>
            {projectPath ? <code title={projectPath}>{projectPath}</code> : null}
          </div>
        </header>

        <section className="dashboard-pulse" aria-label={t("dashboard.pulseTitle")}>
          <div className="dashboard-pulse-label">
            <span>{t("dashboard.pulseTitle")}</span>
            <span className={`dashboard-health dashboard-health--${healthTone}`}>
              <Icon icon={healthTone === "ok" ? Check : CircleAlert} size={11} strokeWidth={2.4} />
              {issueCount === 0
                ? t("dashboard.health.clean")
                : t("dashboard.health.issues", { count: issueCount })}
            </span>
          </div>
          <div className="dashboard-pulse-metrics">
            <PulseMetric value={stats.chapters} label={t("dashboard.stat.chapters")} />
            <PulseMetric value={stats.nodes} label={t("dashboard.stat.nodes")} />
            <PulseMetric value={stats.choices} label={t("dashboard.stat.choices")} />
            <PulseMetric value={stats.characters} label={t("dashboard.stat.characters")} />
            <PulseMetric value={stats.items} label={t("dashboard.stat.items")} />
          </div>
          <div className="dashboard-pulse-state">
            <span>
              <Icon icon={Files} size={12} />
              {t("dashboard.health.media", { count: stats.mediaFiles })}
            </span>
            <span className={stats.unsavedDocs > 0 ? "is-warn" : undefined}>
              <Icon icon={Save} size={12} />
              {stats.unsavedDocs > 0
                ? t("dashboard.health.unsaved", { count: stats.unsavedDocs })
                : t("dashboard.health.saved")}
            </span>
          </div>
        </section>

        <main className="dashboard-main">
          <button type="button" className="dashboard-continue" onClick={openGraph}>
            <span className="dashboard-continue-copy">
              <span className="dashboard-kicker">{t("dashboard.continueLabel")}</span>
              <strong>{t("dashboard.continueGraph")}</strong>
              <span>{startChapter ?? t("dashboard.noChapter")}</span>
            </span>
            <span className="dashboard-map" aria-hidden>
              <svg className="dashboard-map-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                <line className="dashboard-map-edge" x1="20" y1="40" x2="56" y2="27" />
                <line className="dashboard-map-edge" x1="56" y1="27" x2="84" y2="54" />
                <line className="dashboard-map-edge" x1="56" y1="27" x2="44" y2="71" />
              </svg>
              <i className="dashboard-map-node dashboard-map-node--a" />
              <i className="dashboard-map-node dashboard-map-node--b" />
              <i className="dashboard-map-node dashboard-map-node--c" />
              <i className="dashboard-map-node dashboard-map-node--d" />
            </span>
            <span className="dashboard-continue-arrow">
              <ArrowUpRight size={17} />
            </span>
          </button>

          <section className="dashboard-readiness" aria-labelledby="dashboard-readiness-title">
            <div className="dashboard-panel-heading">
              <div>
                <span className="dashboard-kicker">{t("dashboard.readinessLabel")}</span>
                <h2 id="dashboard-readiness-title">{t("dashboard.readinessTitle")}</h2>
              </div>
              <Icon icon={ShieldCheck} size={17} />
            </div>
            <div className="dashboard-readiness-body">
              <strong className={`dashboard-readiness-count is-${lintTone}`}>{lintCount}</strong>
              <span>
                {lintRun?.state === "running"
                  ? t("dashboard.lint.inProgress")
                  : t("dashboard.readinessIssues")}
              </span>
              <small>{lintDetail}</small>
            </div>
            <div className="dashboard-lint-meta">
              {lintDatetime ? (
                <span>{t("dashboard.lint.lastRun", { datetime: lintDatetime })}</span>
              ) : (
                <span>{t("dashboard.lint.noHistory")}</span>
              )}
              {lintStale && <strong>{t("dashboard.lint.stale")}</strong>}
            </div>
            <button
              type="button"
              className="dashboard-inline-action"
              onClick={() => void navigateToTool(navigate, "linter", { run: true })}
            >
              {t("dashboard.action.lint.title")}
              <ArrowUpRight size={12} />
            </button>
          </section>
        </main>

        <section className="dashboard-workspaces-section" aria-labelledby="dashboard-workspaces">
          <div className="dashboard-section-heading">
            <span className="dashboard-kicker">{t("dashboard.workspacesLabel")}</span>
            <h2 id="dashboard-workspaces">{t("dashboard.workspacesTitle")}</h2>
          </div>
          <div className="dashboard-workspaces">
            <WorkspaceLink
              title={t("dashboard.action.manifest.title")}
              meta={t("dashboard.workspace.chapters", { count: stats.chapters })}
              icon={BookOpen}
              onClick={() => void editorNavigate(navigate, { to: Page.EditorManifest })}
            />
            <WorkspaceLink
              title={t("dashboard.action.characters.title")}
              meta={t("dashboard.workspace.entries", { count: stats.characters })}
              icon={Users}
              onClick={() => void editorNavigate(navigate, { to: Page.EditorCharacters })}
            />
            <WorkspaceLink
              title={t("dashboard.action.items.title")}
              meta={t("dashboard.workspace.entries", { count: stats.items })}
              icon={Package}
              onClick={() => void editorNavigate(navigate, { to: Page.EditorItems })}
            />
            <WorkspaceLink
              title={t("dashboard.action.catalog.title")}
              meta={t("dashboard.workspace.entries", { count: catalogCount })}
              icon={Layers3}
              onClick={() =>
                void editorNavigate(navigate, {
                  to: Page.EditorAssets,
                  search: { category: "textures", key: null },
                })
              }
            />
            <WorkspaceLink
              title={t("activity.meta")}
              meta={t("dashboard.workspace.entries", { count: storyDataCount })}
              icon={Workflow}
              onClick={() =>
                void editorNavigate(navigate, {
                  to: Page.EditorMeta,
                  search: { metaKind: "event", metaEntry: null },
                })
              }
            />
            <WorkspaceLink
              title={t("activity.library")}
              meta={t("dashboard.workspace.entries", { count: libraryCount })}
              icon={FolderOpen}
              onClick={() =>
                void editorNavigate(navigate, {
                  to: Page.EditorLibrary,
                  search: { libraryKind: "snippet", libraryEntry: null },
                })
              }
            />
            <WorkspaceLink
              title={t("dashboard.action.files.title")}
              meta={t("dashboard.workspace.files", { count: stats.mediaFiles })}
              icon={Files}
              onClick={() => void editorNavigate(navigate, { to: Page.EditorMedia })}
            />
            <WorkspaceLink
              title={t("dashboard.action.tools.title")}
              meta={t("dashboard.workspace.tools")}
              icon={Wrench}
              onClick={() =>
                void editorNavigate(navigate, {
                  to: Page.EditorTools,
                  search: { tool: "linter" },
                })
              }
            />
          </div>
        </section>
      </div>
    </div>
  );
}
