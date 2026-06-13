import { useTranslation } from "react-i18next";
import { HeroGraphBg } from "./HeroGraphBg";

export function Hero() {
  const { t } = useTranslation();
  return (
    <section className="hero">
      <div className="hero-grid-bg" aria-hidden="true" />
      <HeroGraphBg />
      <div className="container hero-inner">
        <p className="hero-eyebrow">{t("hero.eyebrow")}</p>
        <h1 className="hero-headline" aria-label={t("hero.headline")}>
          <span className="hero-headline-black">{t("brand.wordmark_black")}</span>
          <span className="hero-headline-box">{t("brand.wordmark_box")}</span>
        </h1>
        <p className="hero-tagline">
          {t("hero.tagline")
            .split("\n")
            .map((line, i) => (
              <span key={i}>
                {line}
                {i === 0 && <br />}
              </span>
            ))}
        </p>
        <p className="hero-description">{t("hero.description")}</p>
        <div className="hero-actions">
          <a href="#features" className="btn btn--primary">
            {t("hero.cta_primary")}
          </a>
          <a
            href={t("github_url")}
            className="btn btn--ghost"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("hero.cta_secondary")}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M7 17L17 7M17 7H7M17 7v10" />
            </svg>
          </a>
        </div>
      </div>
      <div className="hero-scroll-hint" aria-hidden="true">
        <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
          <path d="M2.5 4 6 7.5 9.5 4" />
        </svg>
      </div>
    </section>
  );
}
