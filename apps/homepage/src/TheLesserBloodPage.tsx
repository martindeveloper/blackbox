"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Footer } from "./components/Footer";
import "./i18n/index";
import "./styles/the-lesser-blood.css";

type RegisterItem = {
  label: string;
  value: string;
};

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function ArdentSeal({ label }: { label: string }) {
  return (
    <svg
      className="tlb-seal"
      viewBox="0 0 120 120"
      role="img"
      aria-label={label}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="tlbWax" cx="38%" cy="34%" r="78%">
          <stop offset="0%" stopColor="#a8332a" />
          <stop offset="46%" stopColor="#7a221c" />
          <stop offset="100%" stopColor="#481310" />
        </radialGradient>
      </defs>
      <path
        className="tlb-seal-wax"
        d="M60 4c12 0 16 7 27 10s21-1 26 9-1 18 2 28 9 14 5 25-15 9-22 16-9 18-20 21-19-4-29-4-19 8-30 4-12-15-19-22-18-9-21-19 5-18 5-29-8-19-4-29 15-9 22-15S48 4 60 4Z"
        fill="url(#tlbWax)"
      />
      <circle className="tlb-seal-rim" cx="60" cy="60" r="40" />
      <circle className="tlb-seal-rim tlb-seal-rim--inner" cx="60" cy="60" r="33" />
      <path className="tlb-seal-mark" d="M60 34 44 84h7l4-13h18l4 13h7L68 34Zm-3 13 6 18H51Z" />
    </svg>
  );
}

export function TheLesserBloodPage() {
  const { t } = useTranslation();
  const register = t("theLesserBlood.hero.register", { returnObjects: true }) as RegisterItem[];
  const account = t("theLesserBlood.deed.account", { returnObjects: true }) as string[];

  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap"
      />

      <main className="tlb-page">
        <section className="tlb-hero">
          <Image
            className="tlb-hero-image"
            src="/games/the-lesser-blood/mood.webp"
            alt={t("theLesserBlood.hero.image_alt")}
            fill
            priority
            sizes="100vw"
          />
          <div className="tlb-hero-vignette" aria-hidden="true" />
          <div className="tlb-hero-candle" aria-hidden="true" />
          <div className="tlb-grain" aria-hidden="true" />

          <div className="container tlb-hero-inner">
            <div className="tlb-hero-grid">
              <div className="tlb-hero-headline">
                <div className="tlb-crest tlb-rise">
                  <ArdentSeal label={t("theLesserBlood.hero.crest_aria")} />
                  <p>
                    <span>{t("theLesserBlood.hero.house")}</span>
                    <span className="tlb-crest-rule" />
                    <span>{t("theLesserBlood.hero.seat")}</span>
                  </p>
                </div>

                <p className="tlb-record tlb-rise tlb-rise-1">{t("theLesserBlood.hero.record")}</p>

                <h1 className="tlb-title tlb-rise tlb-rise-2">
                  {t("theLesserBlood.hero.title")
                    .split("\n")
                    .map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                </h1>

                <p className="tlb-thesis tlb-rise tlb-rise-3">{t("theLesserBlood.hero.thesis")}</p>
              </div>

              <aside className="tlb-hero-aside tlb-rise tlb-rise-4">
                <p className="tlb-subtitle">{t("theLesserBlood.hero.subtitle")}</p>

                <div className="tlb-status">
                  <span className="tlb-ember" />
                  <span>{t("theLesserBlood.hero.status")}</span>
                </div>

                <dl className="tlb-register" aria-label={t("theLesserBlood.hero.register_aria")}>
                  {register.map((item) => (
                    <div key={item.label}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </aside>
            </div>
          </div>
        </section>

        <section className="tlb-deed">
          <div className="container tlb-deed-inner">
            <span className="tlb-index">{t("theLesserBlood.deed.index")}</span>

            <div className="tlb-deed-grid">
              <blockquote className="tlb-inscription">
                <span className="tlb-inscription-mark" aria-hidden="true">
                  {t("theLesserBlood.deed.inscription_mark")}
                </span>
                <p>{t("theLesserBlood.deed.inscription")}</p>
                <cite>{t("theLesserBlood.deed.inscription_source")}</cite>
              </blockquote>

              <div className="tlb-account">
                {account.map((paragraph, i) => (
                  <p key={paragraph} className={i === 0 ? "tlb-account-lede" : undefined}>
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="tlb-writ">
          <div className="tlb-grain" aria-hidden="true" />
          <div className="container tlb-writ-inner">
            <article className="tlb-parchment">
              <div className="tlb-parchment-seal">
                <ArdentSeal label={t("theLesserBlood.hero.crest_aria")} />
                <span>{t("theLesserBlood.writ.seal_word")}</span>
              </div>
              <h2>{t("theLesserBlood.writ.headline")}</h2>
              <p className="tlb-writ-body">{t("theLesserBlood.writ.body")}</p>

              <div className="tlb-warning">
                <span className="tlb-warning-label">{t("theLesserBlood.writ.warning_label")}</span>
                <p>{t("theLesserBlood.writ.warning")}</p>
              </div>

              <div className="tlb-writ-actions">
                <Link className="tlb-link" href="/games">
                  <ArrowIcon />
                  {t("theLesserBlood.writ.back")}
                </Link>
                <a
                  className="tlb-link tlb-link--ghost"
                  href={t("theLesserBlood.writ.meanwhile_url")}
                >
                  {t("theLesserBlood.writ.meanwhile")}
                  <ArrowIcon />
                </a>
              </div>
            </article>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
