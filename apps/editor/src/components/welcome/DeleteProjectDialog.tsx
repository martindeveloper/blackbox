import { AlertTriangle, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { deleteProject, type ProjectSummary } from "../../lib/projectApi.js";
import { notifyFromError } from "../../lib/notifyApi.js";
import { Icon } from "../icons/Icon.js";
import { Button } from "../ui/Button.js";
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
          <div className="delete-project-warning-icon" aria-hidden>
            <Icon icon={AlertTriangle} size={16} />
          </div>
          <div>
            <div className="delete-project-eyebrow">{t("welcome.deleteProjectEyebrow")}</div>
            <h2 id="delete-project-title">{t("welcome.deleteProjectTitle")}</h2>
            <p>{t("welcome.deleteProjectLead")}</p>
          </div>
        </div>

        <div className="delete-project-body">
          <div className="delete-project-target">
            <strong>{project.title ?? project.name}</strong>
            <span>{project.path}</span>
          </div>

          <div className="delete-project-confirm">
            <label htmlFor={inputId}>
              {t("welcome.deleteProjectConfirmHintPrefix")}
              <code>{project.name}</code>
              {t("welcome.deleteProjectConfirmHintSuffix")}
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
          </div>
        </div>

        <div className="delete-project-footer">
          <Button disabled={deleting} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="danger"
            leadingIcon={Trash2}
            disabled={!canDelete}
            onClick={() => void handleDelete()}
          >
            {deleting ? t("welcome.deletingProject") : t("welcome.deleteProjectAction")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
