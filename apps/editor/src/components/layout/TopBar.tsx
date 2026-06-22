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
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Icon } from "../icons/Icon.js";
import {
  ideLabelForPrefs,
  UserSettingsButton,
  UserSettingsModal,
} from "../settings/UserSettingsModal.js";
import { BugReportButton, BugReportModal } from "../support/BugReportModal.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { transitionToHome } from "../../lib/projectTransition.js";
import { editorNavigate, navigateToTool } from "../../lib/routeHelpers.js";
import { CONTRIBUTION_REVIEW_EVENT } from "../../lib/contributionReview.js";
import type { ProjectContributionReview } from "../../lib/projectApi.js";
import { isActiveEditorPage, Page } from "../../lib/pages.js";
import { CUSTOM_IDE_ID, DEFAULT_IDE_ID } from "../../../shared/ideRegistry.js";
import { useToolRunnerStore } from "../../store/useToolRunnerStore.js";
import { useUserPrefs } from "../../hooks/useUserPrefs.js";
import { Button } from "../ui/Button.js";
import { IconButton } from "../ui/IconButton.js";
import { StatusPill } from "../ui/StatusPill.js";
import { useModal } from "../../context/ModalProvider.js";
import { VcsControl } from "../vcs/VcsControl.js";

/**
 * The "Unsaved" pill plus a hover popover listing which documents are dirty.
 * The popover is portaled to <body> with fixed positioning so it escapes the
 * top bar's `overflow: hidden` clipping and stacking context (a plain absolute
 * child renders behind the workspace and is invisible).
 */
function UnsavedPill({ labels }: { labels: string[] }) {
  const { t } = useTranslation();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);

  const placePopover = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  };

  useLayoutEffect(() => {
    if (!coords) return;
    const onResize = () => placePopover();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [coords]);

  return (
    <div
      ref={anchorRef}
      className="editor-unsaved"
      tabIndex={0}
      onMouseEnter={placePopover}
      onMouseLeave={() => setCoords(null)}
      onFocus={placePopover}
      onBlur={() => setCoords(null)}
    >
      <StatusPill variant="unsaved">
        <Icon icon={Circle} size={7} strokeWidth={3} className="fill-current" />
        {t("topBar.unsaved")}
      </StatusPill>
      {coords
        ? createPortal(
            <div
              className="editor-unsaved-pop"
              role="tooltip"
              style={{ top: coords.top, right: coords.right }}
            >
              <span className="editor-unsaved-pop-title">{t("topBar.unsavedTitle")}</span>
              <ul className="editor-unsaved-pop-list">
                {labels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function TopBar() {
  const { t } = useTranslation();
  const { confirm } = useModal();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const bundle = useScenarioStore((s) => s.bundle);
  const projectName = useScenarioStore((s) => s.projectName);
  const projectPath = useScenarioStore((s) => s.projectPath);
  const projectId = useScenarioStore((s) => s.projectId);
  const revision = useScenarioStore((s) => s.revision);
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
  const [settingsView, setSettingsView] = useState<"appearance" | "audit">("appearance");
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const { prefs } = useUserPrefs();

  const errorCount = validationIssues.filter((i) => i.severity === "error").length;
  const warnCount = validationIssues.filter((i) => i.severity === "warning").length;

  const dirtyLabels = [...dirty]
    .map((key) => {
      if (key.startsWith("chapter:")) {
        const chapterId = key.slice("chapter:".length);
        const name = bundle?.chapters[chapterId]?.title ?? chapterId;
        return t("topBar.dirtyDocs.chapter", { name });
      }
      return t(`topBar.dirtyDocs.${key}`, { defaultValue: key });
    })
    .sort((a, b) => a.localeCompare(b));

  const projectTitle = bundle?.scenario.title ?? projectName;

  useEffect(() => {
    const reviewContribution = (event: Event) => {
      const review = (event as CustomEvent<ProjectContributionReview>).detail;
      if (review.type === "mcp-audit") {
        setSettingsView("audit");
        setSettingsOpen(true);
      }
    };
    window.addEventListener(CONTRIBUTION_REVIEW_EVENT, reviewContribution);
    return () => window.removeEventListener(CONTRIBUTION_REVIEW_EVENT, reviewContribution);
  }, []);

  const handleClose = async () => {
    // Guard against silently discarding unsaved work. Three outcomes:
    //   true  → Save & close, false → Don't save, null → dismissed (keep editing)
    if (dirty.size > 0) {
      const choice = await confirm({
        title: t("topBar.closeUnsavedTitle"),
        message: t("topBar.closeUnsavedMessage"),
        confirmLabel: t("topBar.closeUnsavedSave"),
        cancelLabel: t("topBar.closeUnsavedDiscard"),
        closeAborts: true,
      });
      if (choice === null) return;
      if (choice === true && !(await save())) return;
    }
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
          <span className="editor-topbar-path">{projectTitle ?? t("app.noProject")}</span>
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
          {dirty.size > 0 ? <UnsavedPill labels={dirtyLabels} /> : null}
          {projectName && projectId ? (
            <VcsControl
              projectId={projectId}
              revision={revision}
              dirty={dirty.size > 0 || saving}
            />
          ) : null}
        </div>

        <span className="editor-topbar-divider" aria-hidden />

        <div className="editor-topbar-actions">
          <BugReportButton onClick={() => setBugReportOpen(true)} />
          {bugReportOpen ? <BugReportModal onClose={() => setBugReportOpen(false)} /> : null}
          <UserSettingsButton
            onClick={() => {
              setSettingsView("appearance");
              setSettingsOpen(true);
            }}
          />
          {settingsOpen ? (
            <UserSettingsModal initialView={settingsView} onClose={() => setSettingsOpen(false)} />
          ) : null}
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
              <IconButton
                icon={X}
                title={t("topBar.closeProject")}
                onClick={() => void handleClose()}
              />
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
