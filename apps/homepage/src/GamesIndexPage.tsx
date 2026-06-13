"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Footer } from "./components/Footer";
import "./i18n/index";

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function GamesIndexPage() {
  const { t } = useTranslation();
  const game = t("gamesIndex.silentArchive", { returnObjects: true }) as {
    image_alt: string;
    number: string;
    status: string;
    tags: string[];
    location: string;
    title: string;
    subtitle: string;
    description: string;
    explore: string;
    play: string;
    play_url: string;
  };
  const ledger = t("gamesIndex.ledger", { returnObjects: true }) as string[];

  return (
    <>
      <main className="games-index-page">
        <section className="games-index-hero">
          <div className="games-index-grid" aria-hidden="true" />
          <div className="container games-index-hero-inner">
            <div className="games-index-eyebrow">
              <span>{t("gamesIndex.eyebrow.brand")}</span>
              <span>{t("gamesIndex.eyebrow.catalog")}</span>
            </div>
            <div className="games-index-title-row">
              <h1>
                {t("gamesIndex.headline")
                  .split("\n")
                  .map((line, i) => (
                    <span key={i}>
                      {line}
                      {i === 0 && <br />}
                    </span>
                  ))}
              </h1>
              <p>{t("gamesIndex.description")}</p>
            </div>
            <div className="games-index-ledger" aria-label={t("gamesIndex.ledger_aria")}>
              {ledger.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="games-catalog" id="releases">
          <div className="container">
            <div className="games-catalog-heading">
              <span>{t("gamesIndex.catalog.heading")}</span>
              <p>{t("gamesIndex.catalog.subheading")}</p>
            </div>

            <article className="game-catalog-card">
              <Link
                className="game-catalog-visual"
                href="/games/silent-archive"
                style={{ position: "relative" }}
              >
                <Image
                  src="/games/silent-archive/mainmenu.webp"
                  alt={game.image_alt}
                  fill
                  priority
                  sizes="(max-width: 767px) 100vw, 72vw"
                />
                <div className="game-catalog-image-wash" />
                <span className="game-catalog-number">{game.number}</span>
                <span className="game-catalog-status">
                  <i />
                  {game.status}
                </span>
              </Link>

              <div className="game-catalog-body">
                <div className="game-catalog-meta">
                  {game.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <div className="game-catalog-copy">
                  <div>
                    <p className="game-catalog-location">{game.location}</p>
                    <h2>{game.title}</h2>
                    <p className="game-catalog-subtitle">{game.subtitle}</p>
                  </div>
                  <p>{game.description}</p>
                </div>
                <div className="game-catalog-actions">
                  <Link className="game-catalog-detail" href="/games/silent-archive">
                    {game.explore}
                    <ArrowIcon />
                  </Link>
                  <a className="game-catalog-play" href={game.play_url}>
                    {game.play}
                    <ArrowIcon />
                  </a>
                </div>
              </div>
            </article>

            <div className="games-catalog-pending">
              <span>{t("gamesIndex.pending.number")}</span>
              <p>{t("gamesIndex.pending.message")}</p>
              <strong>{t("gamesIndex.pending.label")}</strong>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
