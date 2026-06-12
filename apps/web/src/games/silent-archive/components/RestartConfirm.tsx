import { useTranslation } from "react-i18next";

interface RestartConfirmButtonsProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function RestartConfirmButtons({ onConfirm, onCancel }: RestartConfirmButtonsProps) {
  const { t } = useTranslation();

  return (
    <div className="restart-confirm-btns">
      <button
        type="button"
        className="restart-confirm-yes"
        onClick={onConfirm}
        aria-label={t("confirm.confirmRestart")}
        title={t("confirm.confirm")}
      >
        ✓
      </button>
      <button
        type="button"
        className="restart-confirm-no"
        onClick={onCancel}
        aria-label={t("confirm.cancelRestart")}
        title={t("confirm.cancel")}
      >
        ✗
      </button>
    </div>
  );
}
