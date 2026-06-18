import Link from "next/link";
import { useTranslation } from "react-i18next";

type DownloadOutdatedNoticeProps = {
  requestedVersion: string;
  latestVersion: string;
};

export function DownloadOutdatedNotice({
  requestedVersion,
  latestVersion,
}: DownloadOutdatedNoticeProps) {
  const { t } = useTranslation();

  return (
    <aside
      className="download-outdated"
      role="status"
      aria-labelledby="download-outdated-title"
    >
      <div className="download-outdated-copy">
        <p className="download-outdated-label">{t("downloadPage.outdated_notice.label")}</p>
        <h2 id="download-outdated-title" className="download-outdated-title">
          {t("downloadPage.outdated_notice.title", {
            requested: requestedVersion,
            latest: latestVersion,
          })}
        </h2>
        <p className="download-outdated-body">
          {t("downloadPage.outdated_notice.body", {
            requested: requestedVersion,
            latest: latestVersion,
          })}
        </p>
      </div>

      <Link href="/download" className="download-outdated-cta">
        {t("downloadPage.outdated_notice.cta", { latest: latestVersion })}
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
          <path
            d="M7 17 17 7M17 7H9M17 7v8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </aside>
  );
}
