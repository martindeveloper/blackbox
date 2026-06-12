import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

const PLATFORM_ICONS: Record<string, ReactElement> = {
  web: (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  ios: (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="5" y="2" width="14" height="20" rx="3" />
      <path d="M9 7h6M12 17h.01" strokeLinecap="round" />
    </svg>
  ),
  cli: (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M8 9l4 3-4 3M13 15h3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

type PlatformItem = { id: string; title: string; tech: string; body: string };

export function Platforms() {
  const { t } = useTranslation();
  const items = t("platforms.items", { returnObjects: true }) as PlatformItem[];

  return (
    <section className="platforms section" id="platforms">
      <div className="container">
        <div className="section-header">
          <span className="section-label">{t("platforms.label")}</span>
          <h2 className="section-headline">{t("platforms.headline")}</h2>
        </div>
        <div className="platforms-grid">
          {items.map((item, i) => (
            <div key={item.id} className="platform-card">
              <span className="platform-bracket platform-bracket--tl" aria-hidden="true" />
              <span className="platform-bracket platform-bracket--br" aria-hidden="true" />
              <span className="platform-index" aria-hidden="true">
                P{i + 1}
              </span>
              <div className="platform-card-top">
                <div className="platform-icon">{PLATFORM_ICONS[item.id]}</div>
                <div>
                  <h3 className="platform-title">{item.title}</h3>
                  <span className="platform-tech">{item.tech}</span>
                </div>
              </div>
              <p className="platform-body">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
