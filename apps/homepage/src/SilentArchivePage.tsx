"use client";

import Image from "next/image";
import { useTranslation } from "react-i18next";
import { Footer } from "./components/Footer";
import "./i18n/index";

type EvidenceItem = {
  id: string;
  code: string;
  label: string;
  image: string;
  alt: string;
  note: string;
};

type TelemetryItem = {
  label: string;
  value: string;
};

type FactItem = {
  label: string;
  value: string;
};

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function SilentArchivePage() {
  const { t } = useTranslation();
  const gameUrl = t("silentArchive.game_url");
  const evidence = t("silentArchive.evidence.items", { returnObjects: true }) as EvidenceItem[];
  const telemetry = t("silentArchive.hero.telemetry", { returnObjects: true }) as TelemetryItem[];
  const facts = t("silentArchive.briefing.facts", { returnObjects: true }) as FactItem[];
  const briefingCopy = t("silentArchive.briefing.copy", { returnObjects: true }) as string[];
  const transmissionMeta = t("silentArchive.transmission.meta", {
    returnObjects: true,
  }) as string[];
  const transmissionFooter = t("silentArchive.transmission.footer", {
    returnObjects: true,
  }) as string[];

  return (
    <>
      <main className="games-page">
        <section className="games-hero" id="archive">
          <Image
            className="games-hero-image"
            src="/games/silent-archive/mainmenu.webp"
            alt={t("silentArchive.hero.image_alt")}
            fill
            priority
            sizes="100vw"
          />
          <div className="games-hero-wash" />
          <div className="games-hero-grid" aria-hidden="true" />
          <div className="container games-hero-inner">
            <div className="games-hero-kicker games-reveal">
              <span>{t("silentArchive.hero.kicker.release")}</span>
              <span className="games-kicker-rule" />
              <span>{t("silentArchive.hero.kicker.status")}</span>
            </div>

            <div className="games-title-wrap">
              <p className="games-case-number games-reveal games-delay-1">
                {t("silentArchive.hero.location")
                  .split("\n")
                  .map((line, i) => (
                    <span key={i}>
                      {line}
                      {i === 0 && <br />}
                    </span>
                  ))}
              </p>
              <h1 className="games-title games-reveal games-delay-2">
                {t("silentArchive.hero.title")
                  .split("\n")
                  .map((line) => (
                    <span key={line}>{line}</span>
                  ))}
              </h1>
              <p className="games-subtitle games-reveal games-delay-3">
                {t("silentArchive.hero.subtitle")}
              </p>
              <p className="games-hero-thesis games-reveal games-delay-3">
                {t("silentArchive.hero.thesis")
                  .split("\n")
                  .map((line, i) => (
                    <span key={i}>
                      {line}
                      {i === 0 && <br />}
                    </span>
                  ))}
              </p>
            </div>

            <aside
              className="games-hero-telemetry games-reveal games-delay-3"
              aria-label={t("silentArchive.hero.telemetry_aria")}
            >
              {telemetry.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </aside>

            <div className="games-hero-footer games-reveal games-delay-4">
              <div className="games-status">
                <span className="games-status-light" />
                <span>{t("silentArchive.hero.status")}</span>
              </div>
              <a className="games-launch games-launch--hero" href={gameUrl}>
                {t("silentArchive.hero.cta")}
                <ArrowIcon />
              </a>
            </div>
          </div>
        </section>

        <section className="games-briefing" id="briefing">
          <div className="container">
            <div className="games-section-heading">
              <span className="games-index">{t("silentArchive.briefing.index")}</span>
              <p>{t("silentArchive.briefing.tags")}</p>
            </div>

            <aside className="games-content-warning" aria-label={t("silentArchive.briefing.content_warning.label")}>
              <span className="games-content-warning-label">
                {t("silentArchive.briefing.content_warning.label")}
              </span>
              <p>{t("silentArchive.briefing.content_warning.body")}</p>
            </aside>

            <div className="games-briefing-grid">
              <div className="games-briefing-title">
                <p className="games-stamp">{t("silentArchive.briefing.stamp")}</p>
                <h2>{t("silentArchive.briefing.headline")}</h2>
              </div>

              <div className="games-briefing-copy">
                {briefingCopy.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </div>

            <blockquote className="games-question">
              <span className="games-question-mark" aria-hidden="true">
                “
              </span>
              <p>{t("silentArchive.briefing.question")}</p>
            </blockquote>

            <div className="games-facts">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="games-transmission" aria-label={t("silentArchive.transmission.aria")}>
          <Image
            className="games-transmission-image"
            src="/games/silent-archive/city.webp"
            alt={t("silentArchive.transmission.image_alt")}
            fill
            sizes="100vw"
          />
          <div className="games-transmission-wash" aria-hidden="true" />
          <div className="games-transmission-grid" aria-hidden="true" />
          <div className="games-transmission-case" aria-hidden="true">
            {t("silentArchive.transmission.case")}
          </div>
          <div className="games-transmission-redactions" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="games-transmission-frame" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="container games-transmission-inner">
            <div className="games-transmission-meta">
              {transmissionMeta.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <div className="games-transmission-copy">
              <p className="games-transmission-label">{t("silentArchive.transmission.label")}</p>
              <blockquote>{t("silentArchive.transmission.quote")}</blockquote>
            </div>
            <div className="games-transmission-time">
              {transmissionFooter.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="games-evidence" id="evidence">
          <div className="container">
            <div className="games-section-heading games-section-heading--dark">
              <span className="games-index">{t("silentArchive.evidence.index")}</span>
              <p>{t("silentArchive.evidence.subheading")}</p>
            </div>

            <div className="games-evidence-list">
              {evidence.map((item) => (
                <article className="games-evidence-item" key={item.id}>
                  <div className="games-evidence-image-wrap">
                    <Image
                      className="games-evidence-image"
                      src={item.image}
                      alt={item.alt}
                      fill
                      sizes="(max-width: 767px) 100vw, 70vw"
                    />
                    <div className="games-evidence-scan" aria-hidden="true" />
                    <div className="games-evidence-hud" aria-hidden="true">
                      <span>{item.code}</span>
                      <span>{t("silentArchive.evidence.visual_record")}</span>
                    </div>
                  </div>
                  <div className="games-evidence-caption">
                    <span>{item.id}</span>
                    <h3>{item.label}</h3>
                    <p>{item.note}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="games-final">
          <div className="games-final-noise" aria-hidden="true" />
          <div className="container games-final-inner">
            <div>
              <span className="games-index">{t("silentArchive.final.index")}</span>
              <h2>{t("silentArchive.final.headline")}</h2>
            </div>
            <div className="games-final-action">
              <p>{t("silentArchive.final.copy")}</p>
              <a className="games-launch" href={gameUrl}>
                {t("silentArchive.final.cta")}
                <ArrowIcon />
              </a>
              <span className="games-external">{t("silentArchive.final.external")}</span>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
