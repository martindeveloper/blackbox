import { useTranslation } from "react-i18next";
import { LockIcon } from "./Icons.js";

export function LockReason({ reason, showDetail }: { reason: string; showDetail: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className="flex items-center gap-1.5 mt-1 text-xs choice-lock-reason"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      <span style={{ flexShrink: 0, opacity: 0.6 }}>
        <LockIcon size={9} />
      </span>
      {showDetail ? reason : t("choices.locked")}
    </span>
  );
}
