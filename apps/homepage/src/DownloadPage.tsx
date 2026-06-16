"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Footer } from "./components/Footer";
import { DownloadTrustGuide } from "./components/DownloadTrustGuide";
import { PlatformIcon } from "./components/PlatformIcon";
import { detectClientArch } from "./lib/detectClientArch";
import { detectClientOS } from "./lib/detectClientOS";
import {
  GITHUB_RELEASES_URL,
  PLATFORM_ARCHES,
  releaseChecksumUrl,
  releaseDownloadUrl,
  type DownloadArch,
  type DownloadPlatform,
  type LinuxFormat,
} from "./lib/releaseAssets";
import "./i18n/index";

const PLATFORMS: DownloadPlatform[] = ["macos", "windows", "linux"];

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M12 4v10m0 0 3.5-3.5M12 14 8.5 10.5M5 18h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
      <path
        d="M7 17 17 7M17 7H9M17 7v8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DownloadPage({ releaseTag }: { releaseTag: string }) {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState<DownloadPlatform>("macos");
  const [arch, setArch] = useState<DownloadArch>("arm64");
  const [linuxFormat, setLinuxFormat] = useState<LinuxFormat>("appimage");

  useEffect(() => {
    let cancelled = false;
    const ua = navigator.userAgent;
    const nextPlatform = detectClientOS(ua);

    void detectClientArch(ua, nextPlatform).then((nextArch) => {
      if (cancelled) {
        return;
      }

      setPlatform(nextPlatform);
      const arches = PLATFORM_ARCHES[nextPlatform];
      setArch(arches.includes(nextArch) ? nextArch : arches[0] ?? "x64");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const availableArches = PLATFORM_ARCHES[platform];
  const activeArch: DownloadArch = availableArches.includes(arch)
    ? arch
    : (availableArches[0] ?? "x64");

  const downloadUrl = useMemo(
    () => releaseDownloadUrl(platform, activeArch, linuxFormat, releaseTag),
    [platform, activeArch, linuxFormat, releaseTag],
  );

  const alternateLinuxFormat: LinuxFormat = linuxFormat === "appimage" ? "deb" : "appimage";
  const alternateLinuxUrl = releaseDownloadUrl(platform, activeArch, alternateLinuxFormat, releaseTag);

  const requirements = t(`downloadPage.requirements.${platform}`, {
    returnObjects: true,
  }) as string[];

  return (
    <>
      <main className="download-page">
        <section className="download-hero">
          <div className="download-hero-grid" aria-hidden="true" />
          <div className="download-hero-beam" aria-hidden="true" />
          <div className="container download-hero-inner">
            <div className="download-hero-kicker">
              <span>{t("downloadPage.hero.kicker.product")}</span>
              <span>{t("downloadPage.hero.kicker.channel")}</span>
            </div>
            <div className="download-hero-copy">
              <h1>
                {t("downloadPage.hero.headline")
                  .split("\n")
                  .map((line, i) => (
                    <span key={i}>
                      {line}
                      {i === 0 && <br />}
                    </span>
                  ))}
              </h1>
              <p>{t("downloadPage.hero.description")}</p>
            </div>
          </div>
        </section>

        <section className="download-panel" id="download">
          <div className="container">
            <div className="download-panel-shell">
              <header className="download-panel-head">
                <span>{t("downloadPage.selector.platform_label")}</span>
              </header>

              <div className="download-platforms" role="radiogroup" aria-label={t("downloadPage.selector.platform_aria")}>
                {PLATFORMS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="radio"
                    aria-checked={platform === item}
                    className={`download-platform${platform === item ? " download-platform--active" : ""}`}
                    onClick={() => {
                      setPlatform(item);
                      const arches = PLATFORM_ARCHES[item];
                      if (!arches.includes(arch)) {
                        setArch(arches[0] ?? "x64");
                      }
                    }}
                  >
                    <span className="download-platform-icon">
                      <PlatformIcon platform={item} />
                    </span>
                    <span className="download-platform-label">{t(`downloadPage.platforms.${item}`)}</span>
                    <span className="download-platform-meta">{t(`downloadPage.platforms.${item}_meta`)}</span>
                  </button>
                ))}
              </div>

              {availableArches.length > 1 ? (
                <div className="download-option-block">
                  <span className="download-option-label">{t("downloadPage.selector.arch_label")}</span>
                  <div
                    className="download-segment"
                    role="radiogroup"
                    aria-label={t("downloadPage.selector.arch_aria")}
                  >
                    {availableArches.map((item) => (
                      <button
                        key={item}
                        type="button"
                        role="radio"
                        aria-checked={activeArch === item}
                        className={`download-segment-btn${activeArch === item ? " download-segment-btn--active" : ""}`}
                        onClick={() => setArch(item)}
                      >
                        {t(`downloadPage.arch.${platform}.${item}`)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {platform === "linux" ? (
                <div className="download-option-block">
                  <span className="download-option-label">{t("downloadPage.selector.format_label")}</span>
                  <div
                    className="download-segment"
                    role="radiogroup"
                    aria-label={t("downloadPage.selector.format_aria")}
                  >
                    {(["appimage", "deb"] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        role="radio"
                        aria-checked={linuxFormat === item}
                        className={`download-segment-btn${linuxFormat === item ? " download-segment-btn--active" : ""}`}
                        onClick={() => setLinuxFormat(item)}
                      >
                        {t(`downloadPage.format.${item}`)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="download-action">
                <a className="download-action-btn" href={downloadUrl}>
                  <DownloadIcon />
                  <span>
                    {t("downloadPage.download_cta")} {t(`downloadPage.platforms.${platform}`)}
                  </span>
                  <span className="download-action-ext">
                    {platform === "macos"
                      ? ".dmg"
                      : platform === "windows"
                        ? ".msix bundle"
                        : linuxFormat === "deb"
                          ? ".deb"
                          : ".AppImage"}
                  </span>
                </a>
                <p className="download-action-note">{t("downloadPage.file_note")}</p>
              </div>

              {platform === "linux" ? (
                <p className="download-alt-format">
                  {t("downloadPage.alternate_format")}{" "}
                  <a href={alternateLinuxUrl}>{t(`downloadPage.format.${alternateLinuxFormat}`)}</a>
                </p>
              ) : null}

              <ul className="download-requirements" aria-label={t("downloadPage.requirements_aria")}>
                {requirements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              <DownloadTrustGuide platform={platform} />

              <footer className="download-panel-footer">
                <a href={releaseChecksumUrl(releaseTag)} target="_blank" rel="noopener noreferrer">
                  {t("downloadPage.checksums")}
                  <ExternalIcon />
                </a>
                <a href={GITHUB_RELEASES_URL} target="_blank" rel="noopener noreferrer">
                  {t("downloadPage.all_releases")}
                  <ExternalIcon />
                </a>
              </footer>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
