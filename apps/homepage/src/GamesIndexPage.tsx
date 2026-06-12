"use client";

import Image from "next/image";
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
  return (
    <>
      <main className="games-index-page">
        <section className="games-index-hero">
          <div className="games-index-grid" aria-hidden="true" />
          <div className="container games-index-hero-inner">
            <div className="games-index-eyebrow">
              <span>Blackbox Games</span>
              <span>Catalog 001</span>
            </div>
            <div className="games-index-title-row">
              <h1>
                Stories that
                <br />
                remember you.
              </h1>
              <p>
                Choice-driven worlds built on the Blackbox narrative engine. Every decision is
                state. Every consequence stays written.
              </p>
            </div>
            <div className="games-index-ledger" aria-label="Catalog summary">
              <span>01 published work</span>
              <span>07 chapters</span>
              <span>Browser playable</span>
              <span>More records pending</span>
            </div>
          </div>
        </section>

        <section className="games-catalog" id="releases">
          <div className="container">
            <div className="games-catalog-heading">
              <span>Current releases</span>
              <p>Open an entry to inspect the case file.</p>
            </div>

            <article className="game-catalog-card">
              <a
                className="game-catalog-visual"
                href="/games/silent-archive"
                style={{ position: "relative" }}
              >
                <Image
                  src="/games/silent-archive/mainmenu.webp"
                  alt="Archive Complex 7-Meridian above a rain-soaked industrial city"
                  fill
                  priority
                  sizes="(max-width: 767px) 100vw, 72vw"
                />
                <div className="game-catalog-image-wash" />
                <span className="game-catalog-number">001</span>
                <span className="game-catalog-status">
                  <i />
                  Case file open
                </span>
              </a>

              <div className="game-catalog-body">
                <div className="game-catalog-meta">
                  <span>Dark sci-fi noir</span>
                  <span>Narrative RPG</span>
                  <span>Play in browser</span>
                </div>
                <div className="game-catalog-copy">
                  <div>
                    <p className="game-catalog-location">Archive Complex 7-Meridian</p>
                    <h2>Silent Archive</h2>
                  </div>
                  <p>
                    A company investigator enters a facility that has been silent for fourteen
                    months. Explore the complex, examine incomplete records, and file a report
                    shaped by your choices.
                  </p>
                </div>
                <div className="game-catalog-actions">
                  <a className="game-catalog-detail" href="/games/silent-archive">
                    Explore the case
                    <ArrowIcon />
                  </a>
                  <a className="game-catalog-play" href="https://silentarchive.onbbx.com">
                    Play now
                    <ArrowIcon />
                  </a>
                </div>
              </div>
            </article>

            <div className="games-catalog-pending">
              <span>002</span>
              <p>Next transmission not yet cleared for release.</p>
              <strong>Record pending</strong>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
