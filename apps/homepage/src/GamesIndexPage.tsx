"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Footer } from "./components/Footer";
import "./i18n/index";
import "./styles/games-catalog.css";

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

type CaseFile = {
  number: string;
  status: string;
  statusKind: "live" | "soon";
  tags: string[];
  location: string;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  image: string;
  imageAlt: string;
  featured?: boolean;
  priority?: boolean;
  explore: string;
  play?: { label: string; url: string };
};

function CaseFileCard(file: CaseFile) {
  const soon = file.statusKind === "soon";
  return (
    <article
      className={[
        "game-card",
        file.featured && "game-card--featured",
        soon && "game-card--upcoming",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Link className="game-card-cover" href={file.href}>
        <Image
          src={file.image}
          alt={file.imageAlt}
          fill
          priority={file.priority}
          sizes="(max-width: 679px) 100vw, (max-width: 1039px) 50vw, 33vw"
        />
        <div className="game-card-wash" aria-hidden="true" />
        <span className="game-card-number">{file.number}</span>
        <span className={`game-card-badge${soon ? " game-card-badge--soon" : ""}`}>
          <i />
          {file.status}
        </span>
        <div className="game-card-headline">
          <p className="game-card-location">{file.location}</p>
          <h2>{file.title}</h2>
          <p className="game-card-subtitle">{file.subtitle}</p>
        </div>
      </Link>

      <div className="game-card-body">
        <div className="game-card-tags">
          {file.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <p className="game-card-desc">{file.description}</p>
        <div className="game-card-actions">
          <Link className="game-card-link" href={file.href}>
            {file.explore}
            <ArrowIcon />
          </Link>
          {file.play && (
            <a className="game-card-link game-card-link--play" href={file.play.url}>
              {file.play.label}
              <ArrowIcon />
            </a>
          )}
        </div>
      </div>
    </article>
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
  const lesserBlood = t("gamesIndex.theLesserBlood", { returnObjects: true }) as {
    image_alt: string;
    number: string;
    status: string;
    tags: string[];
    location: string;
    title: string;
    subtitle: string;
    description: string;
    explore: string;
  };
  const ledger = t("gamesIndex.ledger", { returnObjects: true }) as string[];

  return (
    <>
      <main className="games-index-page">
        <section className="games-index-hero">
          <div className="games-index-grid" aria-hidden="true" />
          <div className="container games-index-hero-inner">
            <div className="games-index-eyebrow games-index-reveal">
              <span>{t("gamesIndex.eyebrow.brand")}</span>
              <span>{t("gamesIndex.eyebrow.catalog")}</span>
            </div>
            <div className="games-index-title-row">
              <h1 className="games-index-reveal games-index-delay-1">
                {t("gamesIndex.headline")
                  .split("\n")
                  .map((line, i) => (
                    <span key={i}>
                      {line}
                      {i === 0 && <br />}
                    </span>
                  ))}
              </h1>
              <p className="games-index-reveal games-index-delay-2">
                {t("gamesIndex.description")}
              </p>
            </div>
            <div
              className="games-index-ledger games-index-reveal games-index-delay-3"
              aria-label={t("gamesIndex.ledger_aria")}
            >
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

            <div className="games-shelf">
              <CaseFileCard
                number={game.number}
                status={game.status}
                statusKind="live"
                tags={game.tags}
                location={game.location}
                title={game.title}
                subtitle={game.subtitle}
                description={game.description}
                href="/games/silent-archive"
                image="/games/silent-archive/mainmenu.webp"
                imageAlt={game.image_alt}
                featured
                priority
                explore={game.explore}
                play={{ label: game.play, url: game.play_url }}
              />

              <CaseFileCard
                number={lesserBlood.number}
                status={lesserBlood.status}
                statusKind="soon"
                tags={lesserBlood.tags}
                location={lesserBlood.location}
                title={lesserBlood.title}
                subtitle={lesserBlood.subtitle}
                description={lesserBlood.description}
                href="/games/the-lesser-blood"
                image="/games/the-lesser-blood/mood.webp"
                imageAlt={lesserBlood.image_alt}
                explore={lesserBlood.explore}
              />

              <article className="game-card game-card--pending">
                <span className="game-card-pending-num">{t("gamesIndex.pending.number")}</span>
                <p>{t("gamesIndex.pending.message")}</p>
                <span className="game-card-pending-label">{t("gamesIndex.pending.label")}</span>
              </article>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
