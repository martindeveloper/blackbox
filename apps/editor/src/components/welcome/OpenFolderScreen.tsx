import { ArrowRight, FolderOpen, Plus, ShieldOff, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  listProjects,
  registerProject,
  revokeAllProjectCodeTrust,
  type ProjectSummary,
} from "../../lib/projectApi.js";
import { pickProjectFolder } from "../../lib/pickProjectFolder.js";
import { Icon } from "../icons/Icon.js";
import { ThemeSelector } from "../layout/ThemeSelector.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { transitionToEditor } from "../../lib/projectTransition.js";
import { Page } from "../../lib/pages.js";
import { editorNavigate } from "../../lib/projectRoute.js";
import { translate } from "../../lib/i18n.js";
import { notifyFromError, notifySuccess } from "../../lib/notifyApi.js";
import { NewProjectWizard } from "./NewProjectWizard.js";
import { DeleteProjectDialog } from "./DeleteProjectDialog.js";

function formatRelativeDate(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 2) return translate("welcome.relative.justNow");
  if (minutes < 60) return translate("welcome.relative.minutesAgo", { count: minutes });
  if (hours < 24) return translate("welcome.relative.hoursAgo", { count: hours });
  if (days === 1) return translate("welcome.relative.yesterday");
  if (days < 30) return translate("welcome.relative.daysAgo", { count: days });
  return new Date(iso).toLocaleDateString();
}

export function OpenFolderScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const requestedId = typeof params.projectId === "string" ? params.projectId : null;
  const openProject = useScenarioStore((state) => state.openProject);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revokingTrust, setRevokingTrust] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const isElectron = typeof window !== "undefined" && !!window.electronAPI;

  const refresh = async () => {
    setLoading(true);
    try {
      setProjects(await listProjects());
    } catch (error) {
      notifyFromError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleOpen = async (projectId: string) => {
    setOpeningId(projectId);
    try {
      if (!(await openProject(projectId))) return;
      await transitionToEditor(() =>
        editorNavigate(navigate, { to: Page.EditorDashboard, search: {} }),
      );
    } finally {
      setOpeningId(null);
    }
  };

  const handlePickFolder = async () => {
    setOpeningId("picker");
    try {
      const folder = await pickProjectFolder();
      if (!folder) return;
      const project = await registerProject(folder);
      setProjects((current) => {
        const next = current.filter((entry) => entry.id !== project.id);
        return [project, ...next];
      });
      await handleOpen(project.id);
    } catch (error) {
      notifyFromError(error);
    } finally {
      setOpeningId(null);
    }
  };

  const handleRevokeAllTrust = async () => {
    setRevokingTrust(true);
    try {
      const revoked = await revokeAllProjectCodeTrust();
      notifySuccess(t("welcome.revokeAllTrustSuccess", { count: revoked }));
    } catch (error) {
      notifyFromError(error);
    } finally {
      setRevokingTrust(false);
    }
  };

  const requested = requestedId ? projects.find((project) => project.id === requestedId) : null;
  const visibleProjects = requested ? [requested] : projects;
  const picking = openingId === "picker";
  const busy = openingId !== null || deleteTarget !== null || revokingTrust;

  if (showNewProject) {
    return <NewProjectWizard onBack={() => setShowNewProject(false)} />;
  }

  return (
    <div className="editor-welcome">
      {deleteTarget ? (
        <DeleteProjectDialog
          project={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={(projectId) => {
            setDeleteTarget(null);
            setProjects((current) => current.filter((entry) => entry.id !== projectId));
            if (requestedId === projectId) {
              void editorNavigate(navigate, { to: Page.Home, search: {} });
            }
          }}
        />
      ) : null}
      <div className="editor-welcome-theme">
        <ThemeSelector />
      </div>
      <div className="splash-card">
        <div className="splash-card-left">
          <div className="splash-brand">
            <div className="splash-wordmark">
              <span className="splash-wordmark-black">BLACK</span>
              <span className="splash-wordmark-box">BOX</span>
            </div>
            <div className="splash-wordmark-sub">{t("welcome.editor")}</div>
          </div>

          <div className="splash-rule" aria-hidden />
          <div className="splash-recents">
            <div className="splash-recents-header">
              <div className="splash-recents-label">
                {requested ? t("welcome.resumeEyebrow") : t("welcome.recent")}
              </div>
              {!requested ? (
                <button
                  type="button"
                  className="splash-revoke-trust"
                  disabled={busy || projects.length === 0}
                  title={t("welcome.revokeAllTrustHint")}
                  onClick={() => void handleRevokeAllTrust()}
                >
                  <Icon icon={ShieldOff} size={10} />
                  {revokingTrust ? t("welcome.revokingTrust") : t("welcome.revokeAllTrust")}
                </button>
              ) : null}
            </div>
            <div className="splash-recents-list">
              {visibleProjects.map((project) => (
                <div
                  key={project.id}
                  className={`splash-recent-item${openingId === project.id ? " splash-recent-item--loading" : ""}`}
                >
                  <button
                    type="button"
                    className="splash-recent-open"
                    disabled={busy}
                    onClick={() => void handleOpen(project.id)}
                  >
                    <div className="splash-recent-icon">
                      <Icon icon={FolderOpen} size={11} />
                    </div>
                    <div className="splash-recent-info">
                      <span className="splash-recent-title">{project.title ?? project.name}</span>
                      <span className="splash-recent-path">{project.name}</span>
                    </div>
                    <span className="splash-recent-meta">
                      {formatRelativeDate(project.lastOpened)}
                    </span>
                    <Icon icon={ArrowRight} size={12} />
                  </button>
                  <button
                    type="button"
                    className="splash-recent-remove"
                    disabled={busy}
                    title={t("welcome.deleteProject")}
                    aria-label={t("welcome.deleteProject")}
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleteTarget(project);
                    }}
                  >
                    <Icon icon={Trash2} size={11} />
                  </button>
                </div>
              ))}
              {!loading && visibleProjects.length === 0 ? (
                <p className="splash-resume-hint">{t("welcome.noProjects")}</p>
              ) : null}
            </div>
          </div>

          <div className="splash-actions splash-actions--primary">
            {isElectron && (
              <button
                type="button"
                className="splash-cta"
                disabled={loading || busy}
                onClick={() => setShowNewProject(true)}
              >
                <Icon icon={Plus} size={13} />
                {t("welcome.newProject")}
              </button>
            )}
            <button
              type="button"
              className="splash-cta"
              disabled={loading || busy}
              onClick={() => void handlePickFolder()}
            >
              <Icon icon={FolderOpen} size={13} />
              {picking ? t("welcome.openingProject") : t("welcome.openProjectFolder")}
            </button>
          </div>
        </div>

        <div className="splash-card-right" aria-hidden>
          <div className="splash-art" />
          <div className="splash-crt" aria-hidden />
        </div>
      </div>
    </div>
  );
}
