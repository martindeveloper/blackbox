import {
  AlertCircle,
  AlertTriangle,
  Circle,
  FlaskConical,
  FolderOpen,
  Loader2,
  MonitorPlay,
  Package,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Icon } from "../icons/Icon.js";
import { ThemeSelector } from "./ThemeSelector.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { transitionToHome } from "../../lib/projectTransition.js";
import { editorNavigate, navigateToTool } from "../../lib/routeHelpers.js";
import { isActiveEditorPage, Page } from "../../lib/pages.js";
import { useToolRunnerStore } from "../../store/useToolRunnerStore.js";
import { Button } from "../ui/Button.js";
import { IconButton } from "../ui/IconButton.js";
import { StatusPill } from "../ui/StatusPill.js";

export function TopBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const bundle = useScenarioStore((s) => s.bundle);
  const projectName = useScenarioStore((s) => s.projectName);
  const dirty = useScenarioStore((s) => s.dirty);
  const saving = useScenarioStore((s) => s.saving);
  const validationIssues = useScenarioStore((s) => s.validationIssues);
  const save = useScenarioStore((s) => s.save);
  const closeFolder = useScenarioStore((s) => s.closeFolder);
  const activeTool = useToolRunnerStore((s) => s.activeTool);
  const toolRunState = useToolRunnerStore((s) => s.runState);
  const toolsBusy = toolRunState === "running";
  const previewActive = isActiveEditorPage(pathname, Page.EditorPreview);

  const errorCount = validationIssues.filter((i) => i.severity === "error").length;
  const warnCount = validationIssues.filter((i) => i.severity === "warning").length;

  const projectTitle = bundle?.scenario.title ?? projectName;
  const projectFolderName = projectName;
  const showFolderName = projectTitle && projectFolderName && projectTitle !== projectFolderName;

  const handleClose = () => {
    void transitionToHome(closeFolder, () => {
      window.location.hash = "/";
    });
  };

  const handleRunTool = (tool: "linter" | "bundle" | "simulator") => {
    if (!projectName || toolsBusy) return;
    void navigateToTool(navigate, tool, { run: true });
  };

  const handleOpenPreview = () => {
    if (!projectName) return;
    void editorNavigate(navigate, { to: Page.EditorPreview });
  };

  return (
    <header className="editor-topbar">
      <div className="editor-topbar-left">
        <div className="editor-topbar-brand">
          <img src="/icon-32.png" alt="" className="editor-brand-mark" aria-hidden />
          <span className="editor-brand-title">
            <span>Black</span>
            <span className="editor-brand-title-box">box</span> {t("welcome.editor")}
          </span>
        </div>

        <span className="editor-topbar-divider" aria-hidden />

        <div className="editor-topbar-context">
          <span
            className="editor-topbar-path"
            title={showFolderName ? (projectFolderName ?? undefined) : undefined}
          >
            {projectTitle ?? t("app.noProject")}
          </span>
          {showFolderName ? (
            <span className="editor-topbar-scenario-name" title={projectFolderName ?? undefined}>
              {projectFolderName}
            </span>
          ) : null}
        </div>
      </div>

      <div className="editor-topbar-center">
        {projectName ? (
          <div
            className={`editor-play-toolbar${toolsBusy ? " editor-play-toolbar--busy" : ""}`}
            role="group"
            aria-label={t("topBar.runTools")}
          >
            <button
              type="button"
              className={`editor-play-btn editor-play-btn--lint${activeTool === "linter" && toolsBusy ? " editor-play-btn--running" : ""}`}
              disabled={!projectName || toolsBusy}
              title={t("tools.linter.description")}
              onClick={() => handleRunTool("linter")}
            >
              <span className="editor-play-btn-icon" aria-hidden>
                {activeTool === "linter" && toolsBusy ? (
                  <Icon icon={Loader2} size={11} className="editor-play-btn-spin" />
                ) : (
                  <Icon icon={ShieldCheck} size={11} strokeWidth={2.5} />
                )}
              </span>
              <span className="editor-play-btn-label">{t("topBar.lint")}</span>
            </button>

            <button
              type="button"
              className={`editor-play-btn editor-play-btn--bundle${activeTool === "bundle" && toolsBusy ? " editor-play-btn--running" : ""}`}
              disabled={!projectName || toolsBusy}
              title={t("tools.bundle.description")}
              onClick={() => handleRunTool("bundle")}
            >
              <span className="editor-play-btn-icon" aria-hidden>
                {activeTool === "bundle" && toolsBusy ? (
                  <Icon icon={Loader2} size={11} className="editor-play-btn-spin" />
                ) : (
                  <Icon icon={Package} size={11} strokeWidth={2.5} />
                )}
              </span>
              <span className="editor-play-btn-label">{t("topBar.bundle")}</span>
            </button>

            <button
              type="button"
              className={`editor-play-btn editor-play-btn--simulator${activeTool === "simulator" && toolsBusy ? " editor-play-btn--running" : ""}`}
              disabled={!projectName || toolsBusy}
              title={t("tools.simulator.description")}
              onClick={() => handleRunTool("simulator")}
            >
              <span className="editor-play-btn-icon" aria-hidden>
                {activeTool === "simulator" && toolsBusy ? (
                  <Icon icon={Loader2} size={12} className="editor-play-btn-spin" />
                ) : (
                  <Icon icon={FlaskConical} size={12} strokeWidth={2.2} />
                )}
              </span>
              <span className="editor-play-btn-label">{t("topBar.simulate")}</span>
            </button>

            <button
              type="button"
              className={`editor-play-btn editor-play-btn--preview${previewActive ? " editor-play-btn--active" : ""}`}
              disabled={!projectName}
              title={t("preview.title")}
              aria-current={previewActive ? "page" : undefined}
              onClick={handleOpenPreview}
            >
              <span className="editor-play-btn-icon" aria-hidden>
                <Icon icon={MonitorPlay} size={13} strokeWidth={2.3} />
              </span>
              <span className="editor-play-btn-label">{t("topBar.preview")}</span>
            </button>
          </div>
        ) : null}
      </div>

      <div className="editor-topbar-right">
        <div className="editor-topbar-status">
          {bundle && errorCount > 0 ? (
            <StatusPill variant="error">
              <Icon icon={AlertCircle} size={12} />
              {t("common.errors", { count: errorCount })}
            </StatusPill>
          ) : null}
          {bundle && warnCount > 0 ? (
            <StatusPill variant="warning">
              <Icon icon={AlertTriangle} size={12} />
              {t("common.warnings", { count: warnCount })}
            </StatusPill>
          ) : null}
          {dirty.size > 0 ? (
            <StatusPill variant="unsaved">
              <Icon icon={Circle} size={7} strokeWidth={3} className="fill-current" />
              {t("topBar.unsaved")}
            </StatusPill>
          ) : null}
        </div>

        <span className="editor-topbar-divider" aria-hidden />

        <div className="editor-topbar-actions">
          <ThemeSelector />
          <Button variant="ghost" size="sm" leadingIcon={FolderOpen} onClick={handleClose}>
            {t("topBar.open")}
          </Button>
          {projectName ? (
            <>
              <Button
                variant="primary"
                size="sm"
                leadingIcon={Save}
                disabled={!bundle || dirty.size === 0 || saving}
                onClick={() => void save()}
              >
                {saving ? t("topBar.saving") : t("topBar.save")}
              </Button>
              <IconButton icon={X} title={t("topBar.closeProject")} onClick={handleClose} />
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
