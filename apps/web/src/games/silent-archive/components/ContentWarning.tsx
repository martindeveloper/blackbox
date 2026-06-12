import { useTranslation } from "react-i18next";

interface ContentWarningProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function ContentWarning({ onConfirm, onCancel }: ContentWarningProps) {
  const { t } = useTranslation();

  return (
    <div className="content-warning">
      <p className="content-warning-text">{t("contentWarning.body")}</p>

      <div className="content-warning-actions">
        <button type="button" className="content-warning-cancel" onClick={onCancel}>
          {t("contentWarning.cancel")}
        </button>
        <button type="button" className="content-warning-confirm" onClick={onConfirm} autoFocus>
          {t("contentWarning.confirm")}
        </button>
      </div>
    </div>
  );
}
