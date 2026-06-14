import { ArrowLeft, FolderOpen, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { deleteProject, type ProjectSummary } from "../../lib/projectApi.js";
import { notifyFromError } from "../../lib/notifyApi.js";
import { Icon } from "../icons/Icon.js";
import { Input } from "../ui/Input.js";

interface DeleteProjectDialogProps {
  project: ProjectSummary;
  onClose: () => void;
  onDeleted: (projectId: string) => void;
}

export function DeleteProjectDialog({ project, onClose, onDeleted }: DeleteProjectDialogProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const matches = confirmName.trim() === project.name;
  const canDelete = matches && !deleting;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deleting, onClose]);

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    try {
      await deleteProject(project.id, confirmName.trim());
      onDeleted(project.id);
    } catch (error) {
      notifyFromError(error);
    } finally {
      setDeleting(false);
    }
  };

  return createPortal(
    <div
      className="delete-project-overlay"
      role="presentation"
      onClick={(event) => {
        if (!deleting && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="delete-project-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-project-title"
      >
        <div className="delete-project-header">
          <button type="button" className="wizard-back-btn" disabled={deleting} onClick={onClose}>
            <Icon icon={ArrowLeft} size={11} />
            {t("common.cancel")}
          </button>

          <div className="delete-project-eyebrow">{t("welcome.deleteProjectEyebrow")}</div>
          <h2 id="delete-project-title" className="wizard-panel-title">
            {t("welcome.deleteProjectTitle")}
          </h2>
          <p className="wizard-panel-subtitle">{t("welcome.deleteProjectLead")}</p>
          <div className="splash-rule delete-project-rule" aria-hidden />
        </div>

        <div className="delete-project-body">
          <div className="delete-project-target">
            <div className="delete-project-target-icon">
              <Icon icon={FolderOpen} size={12} />
            </div>
            <div className="delete-project-target-copy">
              <span className="delete-project-target-title">{project.title ?? project.name}</span>
              <span className="delete-project-target-name">{project.name}</span>
            </div>
          </div>

          <div className="wizard-field">
            <div className="wizard-location-preview">
              <div className="wizard-location-preview-label">
                {t("welcome.deleteProjectPathLabel")}
              </div>
              <div className="wizard-location-preview-path">{project.path}</div>
            </div>
          </div>

          <div className="wizard-field">
            <label className="wizard-field-label" htmlFor={inputId}>
              {t("welcome.deleteProjectConfirmLabel")}
            </label>
            <Input
              id={inputId}
              className="delete-project-input"
              mono
              autoFocus
              value={confirmName}
              disabled={deleting}
              autoComplete="off"
              spellCheck={false}
              placeholder={t("welcome.deleteProjectConfirmPlaceholder")}
              aria-invalid={confirmName.length > 0 && !matches}
              onChange={(event) => setConfirmName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canDelete) void handleDelete();
              }}
            />
            <span className="wizard-field-hint">
              {t("welcome.deleteProjectConfirmHintPrefix")}
              <code className="delete-project-name-token">{project.name}</code>
              {t("welcome.deleteProjectConfirmHintSuffix")}
            </span>
          </div>
        </div>

        <div className="delete-project-footer">
          <button
            type="button"
            className="wizard-secondary-btn"
            disabled={deleting}
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="delete-project-danger-btn"
            disabled={!canDelete}
            onClick={() => void handleDelete()}
          >
            <Icon icon={Trash2} size={12} />
            {deleting ? t("welcome.deletingProject") : t("welcome.deleteProjectAction")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
