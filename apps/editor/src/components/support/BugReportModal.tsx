import { Bug, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";
import { useTheme } from "../../context/ThemeContext.js";
import { downloadBugReport } from "../../lib/bugReport.js";
import { Icon } from "../icons/Icon.js";
import { ModalShell } from "../overlay/ModalShell.js";
import { Button } from "../ui/Button.js";
import { Textarea } from "../ui/Textarea.js";

interface BugReportModalProps {
  onClose: () => void;
}

export function BugReportModal({ onClose }: BugReportModalProps) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { theme, themePreference } = useTheme();
  const [comment, setComment] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      downloadBugReport({
        comment,
        pathname,
        theme,
        themePreference,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ModalShell
      title={t("bugReport.title")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={generating}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={generating}
            onClick={() => void handleGenerate()}
          >
            <span className="editor-btn-content">
              <Icon
                icon={generating ? Loader2 : Bug}
                size={14}
                className={generating ? "build-spin" : undefined}
              />
              {generating ? t("bugReport.generating") : t("bugReport.generate")}
            </span>
          </Button>
        </>
      }
    >
      <div className="bug-report">
        <p className="bug-report-lead">{t("bugReport.lead")}</p>
        <label className="bug-report-field">
          <span className="bug-report-label">{t("bugReport.commentLabel")}</span>
          <Textarea
            className="bug-report-textarea"
            rows={5}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t("bugReport.commentPlaceholder")}
            disabled={generating}
          />
        </label>
        <p className="bug-report-meta">{t("bugReport.includes")}</p>
        {error ? <p className="bug-report-error">{error}</p> : null}
      </div>
    </ModalShell>
  );
}

export function BugReportButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="ghost"
      size="sm"
      leadingIcon={Bug}
      onClick={onClick}
      title={t("bugReport.title")}
      aria-label={t("bugReport.title")}
    />
  );
}
