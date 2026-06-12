import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

const ICONS: Record<string, ReactElement> = {
  narrative: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
    </svg>
  ),
  choices: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M4 6h2m14 0h-8m-6 6h6m8 0h-2M4 18h2m14 0h-8" strokeLinecap="round" />
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
    </svg>
  ),
  checks: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1" fill="currentColor" />
      <circle cx="15.5" cy="8.5" r="1" fill="currentColor" />
      <circle cx="8.5" cy="15.5" r="1" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  ),
  state: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="7" rx="9" ry="3" />
      <path d="M3 7v5c0 1.66 4.03 3 9 3s9-1.34 9-3V7" />
      <path d="M3 12v5c0 1.66 4.03 3 9 3s9-1.34 9-3v-5" />
    </svg>
  ),
  platform: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" strokeLinecap="round" />
    </svg>
  ),
  assets: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
      <path d="M9 13l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

type FeatureItem = { id: string; title: string; body: string };

export function Features() {
  const { t } = useTranslation();
  const items = t("features.items", { returnObjects: true }) as FeatureItem[];

  return (
    <section className="features section" id="features">
      <div className="container">
        <div className="section-header">
          <span className="section-label">{t("features.label")}</span>
          <h2 className="section-headline">
            {t("features.headline")
              .split("\n")
              .map((line, i) => (
                <span key={i}>
                  {line}
                  {i === 0 && <br />}
                </span>
              ))}
          </h2>
        </div>
        <div className="features-grid">
          {items.map((item, i) => (
            <div key={item.id} className="feature-card">
              <span className="feature-index" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="feature-icon">{ICONS[item.id]}</div>
              <h3 className="feature-title">{item.title}</h3>
              <p className="feature-body">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
