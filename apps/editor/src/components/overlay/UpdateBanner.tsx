import { useState } from "react";
import { ArrowUpCircle, Download, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUpdateCheck } from "../../hooks/useUpdateCheck.js";
import { Icon } from "../icons/Icon.js";
import { IconButton } from "../ui/IconButton.js";

const DISMISS_KEY = "blackbox.update.dismissedVersion";

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function storeDismissed(version: string): void {
  try {
    localStorage.setItem(DISMISS_KEY, version);
  } catch {
    /* ignore unavailable storage */
  }
}

/**
 * Auto-checks for a newer editor release on boot and shows a small popup with an
 * update button. Dismissals are remembered per-version so the same release does
 * not nag on every launch.
 */
export function UpdateBanner() {
  const { t } = useTranslation();
  const { status, result } = useUpdateCheck({ auto: true });
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(readDismissed);

  if (status !== "available" || !result?.updateAvailable) return null;

  const latest = result.latest;
  if (dismissedVersion === latest.version) return null;

  const dismiss = () => {
    storeDismissed(latest.version);
    setDismissedVersion(latest.version);
  };

  return (
    <div className="update-banner-host">
      <div className="update-banner" role="alert">
        <span className="update-banner-accent" aria-hidden />
        <Icon icon={ArrowUpCircle} size={18} className="update-banner-icon shrink-0" />
        <div className="update-banner-body">
          <p className="update-banner-title">{t("update.available")}</p>
          <p className="update-banner-detail">
            {t("update.versionDetail", { version: latest.version, current: result.current })}
          </p>
          <div className="update-banner-actions">
            <a
              className="editor-btn editor-btn-sm editor-btn-primary update-banner-button"
              href={latest.downloadUrl}
              target="_blank"
              rel="noreferrer"
              onClick={dismiss}
            >
              <Icon icon={Download} size={13} />
              {t("update.updateButton")}
            </a>
          </div>
        </div>
        <IconButton
          icon={X}
          className="update-banner-dismiss"
          title={t("update.dismiss")}
          onClick={dismiss}
        />
      </div>
    </div>
  );
}
