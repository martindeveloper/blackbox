import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

const ICONS: Record<string, ReactElement> = {
  linter: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  simulator: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <polygon points="5 3 19 12 5 21 5 3" strokeLinejoin="round" />
    </svg>
  ),
  bundler: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
};

type ToolItem = { id: string; title: string; subtitle: string; body: string };

export function Toolchain() {
  const { t } = useTranslation();
  const items = t("toolchain.items", { returnObjects: true }) as ToolItem[];

  return (
    <section className="toolchain section" id="toolchain">
      <div className="container">
        <div className="toolchain-header">
          <div>
            <span className="section-label">{t("toolchain.label")}</span>
            <h2 className="section-headline">{t("toolchain.headline")}</h2>
          </div>
          <p className="toolchain-body">{t("toolchain.body")}</p>
        </div>
        <div className="toolchain-grid">
          {items.flatMap((item, i) => {
            const card = (
              <div key={item.id} className={`toolchain-card toolchain-card--${item.id}`}>
                <div className="toolchain-card-head">
                  <div className="toolchain-icon">{ICONS[item.id]}</div>
                  <h3 className="toolchain-title">{item.title}</h3>
                  <span className="toolchain-index" aria-hidden="true">
                    T{i + 1}
                  </span>
                </div>
                <div className="toolchain-card-right">
                  <div className="toolchain-cmd" aria-hidden="true">
                    <span className="toolchain-cmd-prompt">$</span>
                    <code className="toolchain-subtitle">{item.subtitle}</code>
                    <span className="toolchain-cmd-cursor" />
                  </div>
                  <p className="toolchain-card-body">{item.body}</p>
                </div>
              </div>
            );
            if (i < items.length - 1) {
              return [
                card,
                <div key={`conn-${i}`} className="toolchain-connector" aria-hidden="true">
                  <span className="toolchain-connector-track" />
                  <span className="toolchain-connector-head" />
                </div>,
              ];
            }
            return [card];
          })}
        </div>
      </div>
    </section>
  );
}
