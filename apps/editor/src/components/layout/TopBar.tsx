import {
  AlertCircle,
  AlertTriangle,
  Circle,
  FlaskConical,
  Loader2,
  MonitorPlay,
  Package,
  Save,
  ShieldCheck,
  SquareTerminal,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Icon } from "../icons/Icon.js";
import {
  ideLabelForPrefs,
  UserSettingsButton,
  UserSettingsModal,
} from "../settings/UserSettingsModal.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { transitionToHome } from "../../lib/projectTransition.js";
import { editorNavigate, navigateToTool } from "../../lib/routeHelpers.js";
import { isActiveEditorPage, Page } from "../../lib/pages.js";
import { CUSTOM_IDE_ID, DEFAULT_IDE_ID } from "../../../shared/ideRegistry.js";
import { useToolRunnerStore } from "../../store/useToolRunnerStore.js";
import { useUserPrefs } from "../../hooks/useUserPrefs.js";
import { Button } from "../ui/Button.js";
import { IconButton } from "../ui/IconButton.js";
import { StatusPill } from "../ui/StatusPill.js";

export function TopBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const bundle = useScenarioStore((s) => s.bundle);
  const projectName = useScenarioStore((s) => s.projectName);
  const projectPath = useScenarioStore((s) => s.projectPath);
  const dirty = useScenarioStore((s) => s.dirty);
  const saving = useScenarioStore((s) => s.saving);
  const validationIssues = useScenarioStore((s) => s.validationIssues);
  const save = useScenarioStore((s) => s.save);
  const closeFolder = useScenarioStore((s) => s.closeFolder);
  const activeTool = useToolRunnerStore((s) => s.activeTool);
  const toolRunState = useToolRunnerStore((s) => s.runState);
  const toolsBusy = toolRunState === "running";
  const previewActive = isActiveEditorPage(pathname, Page.EditorPreview);
  const [openingIde, setOpeningIde] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { prefs } = useUserPrefs();

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

  const preferredIdeId = prefs.preferredIde ?? DEFAULT_IDE_ID;
  const preferredIdeLabel = ideLabelForPrefs(preferredIdeId, prefs.customIdePath);

  const handleOpenIde = async () => {
    if (!projectPath || !window.electronAPI || openingIde) return;
    setOpeningIde(true);
    try {
      const customPath = preferredIdeId === CUSTOM_IDE_ID ? prefs.customIdePath : undefined;
      const opened = await window.electronAPI.openInIde(projectPath, preferredIdeId, customPath);
      if (!opened) {
        window.alert(t("topBar.ideNotFound", { ide: preferredIdeLabel }));
      }
    } finally {
      setOpeningIde(false);
    }
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
          <UserSettingsButton onClick={() => setSettingsOpen(true)} />
          {settingsOpen ? <UserSettingsModal onClose={() => setSettingsOpen(false)} /> : null}
          {projectPath && window.electronAPI ? (
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={SquareTerminal}
              disabled={openingIde}
              onClick={() => void handleOpenIde()}
            >
              {openingIde
                ? t("topBar.openingIde", { ide: preferredIdeLabel })
                : t("topBar.openIde", { ide: preferredIdeLabel })}
            </Button>
          ) : null}
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
