"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import type { ReleaseArchiveEntry } from "@/lib/fetchReleaseArchive";
import { normalizeReleaseTag } from "@/lib/releaseVersion";

type DownloadReleaseArchiveProps = {
  latestVersion: string;
  releases: ReleaseArchiveEntry[];
};

function formatReleaseDate(value: string | null, locale: string): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function DownloadReleaseArchive({ latestVersion, releases }: DownloadReleaseArchiveProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedVersion = normalizeReleaseTag(searchParams.get("version"));
  const selectedTag = requestedVersion ?? "";

  if (releases.length <= 1) {
    return null;
  }

  const handleChange = (nextTag: string) => {
    if (nextTag === "") {
      router.push("/download");
      return;
    }

    router.push(`/download?version=${encodeURIComponent(nextTag)}`);
  };

  return (
    <section className="download-archive" aria-labelledby="download-archive-title">
      <header className="download-archive-head">
        <div>
          <h2 id="download-archive-title" className="download-archive-title">
            {t("downloadPage.archive.title")}
          </h2>
          <p className="download-archive-note">{t("downloadPage.archive.note")}</p>
        </div>
        <span className="download-archive-count">
          {t("downloadPage.archive.count", { count: releases.length })}
        </span>
      </header>

      <label className="download-archive-field">
        <span className="download-archive-label">{t("downloadPage.archive.version_label")}</span>
        <span className="download-archive-select-wrap">
          <select
            className="download-archive-select"
            value={selectedTag}
            aria-label={t("downloadPage.archive.version_aria")}
            onChange={(event) => handleChange(event.target.value)}
          >
            <option value="">
              {t("downloadPage.archive.latest_option", { version: latestVersion })}
            </option>
            {releases.map((release) => {
              if (release.tag === latestVersion) {
                return null;
              }

              const dateLabel = formatReleaseDate(release.publishedAt, i18n.language);
              const suffix = release.prerelease ? ` · ${t("downloadPage.archive.prerelease")}` : "";
              const label = dateLabel
                ? t("downloadPage.archive.version_option_dated", {
                    version: release.tag,
                    date: dateLabel,
                  }) + suffix
                : release.tag + suffix;

              return (
                <option key={release.tag} value={release.tag}>
                  {label}
                </option>
              );
            })}
          </select>
        </span>
      </label>
    </section>
  );
}
