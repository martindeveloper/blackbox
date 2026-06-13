"use client";

import Image from "next/image";
import { Footer } from "./components/Footer";
import "./i18n/index";

const GAME_URL = "https://silentarchive.onbbx.com";

const EVIDENCE = [
  {
    id: "01",
    code: "7MER / 01.119",
    label: "The Chapel",
    image: "/games/silent-archive/chapel.webp",
    alt: "Maintenance Chapel — a dark alcove lit by residual charge from dead server racks",
    note: "Maintenance alcove, emergency relay, redundant cooling access. Neglect made it something the staff never filed a name for.",
  },
  {
    id: "02",
    code: "7MER / 04.032",
    label: "The Quiet Ward",
    image: "/games/silent-archive/quiet-ward.webp",
    alt: "The Quiet Ward — a soft-lit decommissioning bay with a single reclined cradle",
    note: "The sign on the door does not lie. The quietest room in the complex — built so that nothing here would disturb anything else.",
  },
  {
    id: "03",
    code: "7MER / 05.406",
    label: "The Memory Garden",
    image: "/games/silent-archive/memory-garden.webp",
    alt: "Memory Garden — server racks threaded with glowing fiber optic cabling in a warm cognitive archive",
    note: "Cognitive archive. Fiber optics weave through the racks like vines; in the dark, amber and blue light reads almost like growth.",
  },
] as const;

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function SilentArchivePage() {
  return (
    <>
      <main className="games-page">
        <section className="games-hero" id="archive">
          <Image
            className="games-hero-image"
            src="/games/silent-archive/mainmenu.webp"
            alt="Archive Complex 7-Meridian rising above a rain-soaked industrial city"
            fill
            priority
            sizes="100vw"
          />
          <div className="games-hero-wash" />
          <div className="games-hero-grid" aria-hidden="true" />
          <div className="container games-hero-inner">
            <div className="games-hero-kicker games-reveal">
              <span>Blackbox release 001</span>
              <span className="games-kicker-rule" />
              <span>Case file open</span>
            </div>

            <div className="games-title-wrap">
              <p className="games-case-number games-reveal games-delay-1">
                Archive Complex
                <br />
                7-Meridian
              </p>
              <h1 className="games-title games-reveal games-delay-2">
                <span>Silent</span>
                <span>Archive</span>
              </h1>
              <p className="games-subtitle games-reveal games-delay-3">
                Every Record Remembers
              </p>
              <p className="games-hero-thesis games-reveal games-delay-3">
                Fourteen months without contact.
                <br />
                One investigation left to complete.
              </p>
            </div>

            <aside
              className="games-hero-telemetry games-reveal games-delay-3"
              aria-label="Archive telemetry"
            >
              <div>
                <span>Signal</span>
                <strong>Recovered</strong>
              </div>
              <div>
                <span>Occupancy</span>
                <strong>Unknown</strong>
              </div>
              <div>
                <span>Last contact</span>
                <strong>14 mo.</strong>
              </div>
            </aside>

            <div className="games-hero-footer games-reveal games-delay-4">
              <div className="games-status">
                <span className="games-status-light" />
                <span>Investigation active</span>
              </div>
              <a className="games-launch games-launch--hero" href={GAME_URL}>
                Enter the archive
                <ArrowIcon />
              </a>
            </div>
          </div>
        </section>

        <section className="games-briefing" id="briefing">
          <div className="container">
            <div className="games-section-heading">
              <span className="games-index">01 / Investigation brief</span>
              <p>Dark sci-fi noir · Narrative RPG · Play in browser</p>
            </div>

            <aside className="games-content-warning" aria-label="Content warning">
              <span className="games-content-warning-label">Content warning</span>
              <p>
                This game explores psychological distress, institutional abuse, confinement, death,
                assisted dying, identity disturbance, and morally difficult choices.
              </p>
            </aside>

            <div className="games-briefing-grid">
              <div className="games-briefing-title">
                <p className="games-stamp">Meridian Cognitive Systems</p>
                <h2>You were sent to file a report. Your brief ends at the entrance.</h2>
              </div>

              <div className="games-briefing-copy">
                <p>
                  Archive Complex 7-Meridian has been dark for fourteen months. No personnel
                  contact. No maintenance pings. No distress signals. You are CASE, a company
                  investigator sent to enter the facility, establish the facts, and file a final
                  report.
                </p>
                <p>
                  Explore a sealed industrial complex, examine incomplete records, and decide how
                  CASE responds when evidence refuses to fit neatly into the assignment. Every
                  conclusion is yours to reach.
                </p>
              </div>
            </div>

            <blockquote className="games-question">
              <span className="games-question-mark" aria-hidden="true">
                “
              </span>
              <p>In a place built to preserve information, how much can you trust what remains?</p>
            </blockquote>

            <div className="games-facts">
              <div>
                <span>Format</span>
                <strong>Choice-driven narrative</strong>
              </div>
              <div>
                <span>Setting</span>
                <strong>Corporate legal horror</strong>
              </div>
              <div>
                <span>Case status</span>
                <strong>Unresolved</strong>
              </div>
              <div>
                <span>Powered by</span>
                <strong>Blackbox Engine</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="games-transmission" aria-label="Recovered archive transmission">
          <Image
            className="games-transmission-image"
            src="/games/silent-archive/city.webp"
            alt="A rain-soaked industrial city surrounding Archive Complex 7-Meridian"
            fill
            sizes="100vw"
          />
          <div className="games-transmission-wash" aria-hidden="true" />
          <div className="games-transmission-grid" aria-hidden="true" />
          <div className="games-transmission-case" aria-hidden="true">
            7-Meridian
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
              <span>Case memorandum / 7MER-031</span>
              <span>Clearance provisional</span>
            </div>
            <div className="games-transmission-copy">
              <p className="games-transmission-label">Investigator directive · Details withheld</p>
              <blockquote>Enter with a brief. Leave with your own account.</blockquote>
            </div>
            <div className="games-transmission-time">
              <span>Document 001 / 07</span>
              <span>Distribution restricted</span>
            </div>
          </div>
        </section>

        <section className="games-evidence" id="evidence">
          <div className="container">
            <div className="games-section-heading games-section-heading--dark">
              <span className="games-index">02 / Recovered evidence</span>
              <p>Selected locations · Spoiler-safe archive</p>
            </div>

            <div className="games-evidence-list">
              {EVIDENCE.map((item) => (
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
                      <span>Visual record</span>
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
              <span className="games-index">03 / Authorization requested</span>
              <h2>The report is blank. The conclusion is yours.</h2>
            </div>
            <div className="games-final-action">
              <p>
                Enter Archive Complex 7-Meridian. Investigate carefully. What follows is determined
                by the choices you make.
              </p>
              <a className="games-launch" href={GAME_URL}>
                Play Silent Archive
                <ArrowIcon />
              </a>
              <span className="games-external">silentarchive.onbbx.com</span>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
