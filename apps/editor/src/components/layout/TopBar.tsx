import {
  AlertCircle,
  AlertTriangle,
  Circle,
  FlaskConical,
  Loader2,
  MonitorPlay,
  Package,
  Save,
  Search,
  ShieldCheck,
  UploadCloud,
  SquareTerminal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Icon } from "@/components/icons/Icon.js";
import {
  ideLabelForPrefs,
  UserSettingsButton,
  UserSettingsModal,
} from "@/components/settings/UserSettingsModal.js";
import { BugReportButton, BugReportModal } from "@/components/support/BugReportModal.js";
import { useScenarioStore } from "@/store/useScenarioStore.js";
import { transitionToHome } from "@/lib/projectTransition.js";
import { openOmnibox } from "@/lib/omnibox.js";
import { formatShortcutKeys } from "@/lib/shortcuts.js";
import { editorNavigate, navigateToTool } from "@/lib/routeHelpers.js";
import { CONTRIBUTION_REVIEW_EVENT } from "@/lib/contributionReview.js";
import { getVcsStatus, type ProjectContributionReview, type VcsStatus } from "@/lib/projectApi.js";
import { isActiveEditorPage, Page } from "@/lib/pages.js";
import { CUSTOM_IDE_ID, DEFAULT_IDE_ID } from "@shared/ideRegistry.js";
import { useToolRunnerStore } from "@/store/useToolRunnerStore.js";
import { useUserPrefs } from "@/hooks/useUserPrefs.js";
import { Button } from "@/components/ui/Button.js";
import { IconButton } from "@/components/ui/IconButton.js";
import { StatusPill } from "@/components/ui/StatusPill.js";
import { Textarea } from "@/components/ui/Textarea.js";
import { ModalShell } from "@/components/overlay/ModalShell.js";
import { useModal } from "@/context/ModalProvider.js";
import { VcsControl } from "@/components/vcs/VcsControl.js";

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
  const saveAndSync = useScenarioStore((s) => s.saveAndSync);
  const closeFolder = useScenarioStore((s) => s.closeFolder);
  const activeTool = useToolRunnerStore((s) => s.activeTool);
  const toolRunState = useToolRunnerStore((s) => s.runState);
  const toolsBusy = toolRunState === "running";
  const previewActive = isActiveEditorPage(pathname, Page.EditorPreview);
  const [openingIde, setOpeningIde] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsView, setSettingsView] = useState<"appearance" | "audit">("appearance");
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncPromptOpen, setSyncPromptOpen] = useState(false);
  const [syncPromptMessage, setSyncPromptMessage] = useState("");
  const [vcsState, setVcsState] = useState<{
    projectId: string;
    status: VcsStatus | null;
  } | null>(null);
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
  const vcsStatus = vcsState?.projectId === projectId ? vcsState.status : null;
  const saveAndSyncPreferred = prefs.saveAndSyncDefault === true;
  const projectSyncReady =
    saveAndSyncPreferred &&
    vcsStatus?.configured === true &&
    vcsStatus.unavailable !== true &&
    vcsStatus.initialized !== false;
  const primarySaveLabel = projectSyncReady ? t("topBar.saveAndSync") : t("topBar.save");
  const primarySavingLabel = projectSyncReady ? t("topBar.syncing") : t("topBar.saving");
  const saveMessage =
    dirtyLabels.length > 0
      ? t("vcs.authorSyncMessage", {
          changes: dirtyLabels.slice(0, 3).join(", "),
          count: dirtyLabels.length,
        })
      : t("vcs.authorSyncProjectMessage");

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

  useEffect(() => {
    let active = true;
    if (!projectId) {
      return () => {
        active = false;
      };
    }
    void getVcsStatus(projectId)
      .then((status) => {
        if (active) setVcsState({ projectId, status });
      })
      .catch(() => {
        if (active) setVcsState({ projectId, status: null });
      });
    return () => {
      active = false;
    };
  }, [projectId, revision]);

  const runSaveAndSync = async (message: string) => {
    setSyncing(true);
    try {
      await saveAndSync(message.trim() || saveMessage);
    } finally {
      setSyncing(false);
    }
  };

  const handlePrimarySave = () => {
    if (!projectSyncReady) {
      void save();
      return;
    }
    if (prefs.askSyncDescription === true) {
      setSyncPromptMessage(saveMessage);
      setSyncPromptOpen(true);
      return;
    }
    void runSaveAndSync(saveMessage);
  };

  const handleVcsStatusChange = useCallback(
    (status: VcsStatus | null) => {
      if (projectId) setVcsState({ projectId, status });
    },
    [projectId],
  );

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

  const hasStatus =
    (bundle && errorCount > 0) ||
    (bundle && warnCount > 0) ||
    dirty.size > 0 ||
    (projectName && projectId);

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

        {projectName ? (
          <button
            type="button"
            className="editor-omnibox-trigger"
            onClick={() => openOmnibox()}
            title={t("omnibox.placeholder")}
          >
            <Icon icon={Search} size={12} className="editor-omnibox-trigger-icon" />
            <span className="editor-omnibox-trigger-label">{t("omnibox.triggerLabel")}</span>
            <kbd className="editor-omnibox-trigger-kbd">{formatShortcutKeys("omniboxOpen")}</kbd>
          </button>
        ) : null}
      </div>

      <div className="editor-topbar-right">
        {projectName ? (
          <>
            <div
              className={`editor-tool-strip${toolsBusy ? " editor-tool-strip--busy" : ""}`}
              role="group"
              aria-label={t("topBar.runTools")}
            >
              <button
                type="button"
                className={`editor-tool-btn${activeTool === "linter" && toolsBusy ? " editor-tool-btn--running" : ""}`}
                disabled={toolsBusy}
                title={t("tools.linter.description")}
                onClick={() => handleRunTool("linter")}
              >
                <span className="editor-tool-btn-icon" aria-hidden>
                  {activeTool === "linter" && toolsBusy ? (
                    <Icon icon={Loader2} size={11} className="editor-tool-btn-spin" />
                  ) : (
                    <Icon icon={ShieldCheck} size={11} strokeWidth={2.5} />
                  )}
                </span>
                <span className="editor-tool-btn-label">{t("topBar.lint")}</span>
              </button>

              <button
                type="button"
                className={`editor-tool-btn${activeTool === "bundle" && toolsBusy ? " editor-tool-btn--running" : ""}`}
                disabled={toolsBusy}
                title={t("tools.bundle.description")}
                onClick={() => handleRunTool("bundle")}
              >
                <span className="editor-tool-btn-icon" aria-hidden>
                  {activeTool === "bundle" && toolsBusy ? (
                    <Icon icon={Loader2} size={11} className="editor-tool-btn-spin" />
                  ) : (
                    <Icon icon={Package} size={11} strokeWidth={2.5} />
                  )}
                </span>
                <span className="editor-tool-btn-label">{t("topBar.bundle")}</span>
              </button>

              <button
                type="button"
                className={`editor-tool-btn${activeTool === "simulator" && toolsBusy ? " editor-tool-btn--running" : ""}`}
                disabled={toolsBusy}
                title={t("tools.simulator.description")}
                onClick={() => handleRunTool("simulator")}
              >
                <span className="editor-tool-btn-icon" aria-hidden>
                  {activeTool === "simulator" && toolsBusy ? (
                    <Icon icon={Loader2} size={11} className="editor-tool-btn-spin" />
                  ) : (
                    <Icon icon={FlaskConical} size={11} strokeWidth={2.2} />
                  )}
                </span>
                <span className="editor-tool-btn-label">{t("topBar.simulate")}</span>
              </button>

              <button
                type="button"
                className={`editor-tool-btn editor-tool-btn--preview${previewActive ? " editor-tool-btn--active" : ""}`}
                title={t("preview.title")}
                aria-current={previewActive ? "page" : undefined}
                onClick={handleOpenPreview}
              >
                <span className="editor-tool-btn-icon" aria-hidden>
                  <Icon icon={MonitorPlay} size={11} strokeWidth={2.3} />
                </span>
                <span className="editor-tool-btn-label">{t("topBar.preview")}</span>
              </button>
            </div>

            <span className="editor-topbar-divider" aria-hidden />
          </>
        ) : null}

        {hasStatus ? (
          <>
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
                  onStatusChange={handleVcsStatusChange}
                />
              ) : null}
            </div>

            <span className="editor-topbar-divider" aria-hidden />
          </>
        ) : null}

        <div className="editor-topbar-actions">
          <UserSettingsButton
            onClick={() => {
              setSettingsView("appearance");
              setSettingsOpen(true);
            }}
          />
          {settingsOpen ? (
            <UserSettingsModal initialView={settingsView} onClose={() => setSettingsOpen(false)} />
          ) : null}
          {syncPromptOpen ? (
            <ModalShell
              title={t("vcs.syncDescriptionTitle")}
              onClose={() => setSyncPromptOpen(false)}
              footer={
                <>
                  <Button variant="ghost" onClick={() => setSyncPromptOpen(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button
                    variant="primary"
                    leadingIcon={UploadCloud}
                    disabled={syncing}
                    onClick={() => {
                      setSyncPromptOpen(false);
                      void runSaveAndSync(syncPromptMessage);
                    }}
                  >
                    {syncing ? t("topBar.syncing") : t("topBar.saveAndSync")}
                  </Button>
                </>
              }
            >
              <div className="save-sync-prompt">
                <p className="modal-panel-message">{t("vcs.syncDescriptionHint")}</p>
                <Textarea
                  autoFocus
                  rows={3}
                  maxLength={500}
                  value={syncPromptMessage}
                  placeholder={t("vcs.changeMessage")}
                  onChange={(event) => setSyncPromptMessage(event.target.value)}
                />
              </div>
            </ModalShell>
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
            <Button
              variant="primary"
              size="sm"
              leadingIcon={projectSyncReady ? UploadCloud : Save}
              disabled={!bundle || dirty.size === 0 || saving || syncing}
              title={projectSyncReady ? t("topBar.saveAndSyncHint") : undefined}
              onClick={handlePrimarySave}
            >
              {saving || syncing ? primarySavingLabel : primarySaveLabel}
            </Button>
          ) : null}
        </div>

        <div className="editor-topbar-end">
          <BugReportButton onClick={() => setBugReportOpen(true)} />
          {bugReportOpen ? <BugReportModal onClose={() => setBugReportOpen(false)} /> : null}
          {projectName ? (
            <IconButton
              icon={X}
              title={t("topBar.closeProject")}
              onClick={() => void handleClose()}
            />
          ) : null}
        </div>
      </div>
    </header>
  );
}
