"use client";

import Image from "next/image";
import { Footer } from "./components/Footer";
import "./i18n/index";

const AUTHORING_FEATURES = [
  {
    index: "01",
    title: "Shape the whole scenario",
    body: "Set project identity, revision, deterministic random seed, default stats, relationship overrides, chapter order, and every linked sidecar from one manifest view.",
    tags: ["Manifest", "Chapters", "Stats", "Sidecars"],
  },
  {
    index: "02",
    title: "Write expressive scenes",
    body: "Compose paragraphs, dialogue, thoughts, and stage directions with speakers, emotion, screen position, actor presence, conditional alternatives, and live-value interpolation.",
    tags: ["Dialogue", "Interpolation", "Actors", "Conditional text"],
  },
  {
    index: "03",
    title: "Build real branching logic",
    body: "Wire direct routes, cross-chapter transitions, menu actions, restart flows, and skill checks with normal, advantage, or disadvantage rolls and separate success, failure, and exhausted outcomes.",
    tags: ["Choices", "Skill checks", "Outcomes", "Transitions"],
  },
  {
    index: "04",
    title: "Make state visible",
    body: "Gate content by inventory, flags, stats, visited nodes, current location, relationships, or actor presence. Combine rules with all, any, and not, then explain disabled choices to players.",
    tags: ["Gates", "Flags", "Relationships", "Named conditions"],
  },
  {
    index: "05",
    title: "Author consequences",
    body: "Attach effects to nodes, choices, and item actions: change stats, set values, add events, modify inventory and relationships, control actor presence, roll dice, and cue music or SFX.",
    tags: ["Effects", "Inventory", "Audio", "Expressions"],
  },
  {
    index: "06",
    title: "Reuse without repetition",
    body: "Create parameterized text snippets, inheritable node templates, and named conditions. Choose whether local text, effects, and choices replace, prepend, or append inherited content.",
    tags: ["Snippets", "Templates", "Inheritance", "Usage tracking"],
  },
];

const WORKSPACE_FEATURES = [
  {
    title: "Cast & relationships",
    body: "Manage portraits, voice references, display color, subtitles, and any number of relationship metrics for every character.",
  },
  {
    title: "Items with behavior",
    body: "Create illustrated inventory entries, examine text, and gated item actions that can consume items, run effects, or move the story.",
  },
  {
    title: "Media, cataloged",
    body: "Import and preview textures, music, and SFX; organize folders, inspect file metadata, restore trash, and map stable logical IDs to source files.",
  },
  {
    title: "Story catalog",
    body: "Document player-facing or internal events and flags, rename them safely, and jump directly to every place each entry is used.",
  },
];

const TOOLCHAIN = [
  {
    command: "blackbox-lint",
    title: "Find structural trouble early",
    body: "Run all rules or focus by category. The editor parses issues, links them back to the graph or library, and tracks whether results became stale after edits.",
  },
  {
    command: "blackbox-bundler inspect",
    title: "Build the production artifact",
    body: "Cook the project for web, inspect bundle.box, review codecs, sizes, chapter dependencies, shared content, and unresolved references before release.",
  },
  {
    command: "blackbox-simulator",
    title: "Prove the story can finish",
    body: "Search for endings and game overs or sweep reachable state. Tune budgets and threads, enforce strict exits, and inspect coverage, blocked goals, hot paths, story spines, and split candidates.",
  },
];

export function EditorPage() {
  return (
    <>
      <main className="editor-page">
        <section className="editor-page-hero">
          <div className="editor-page-grid" aria-hidden="true" />
          <div className="editor-page-orbit editor-page-orbit--one" aria-hidden="true" />
          <div className="editor-page-orbit editor-page-orbit--two" aria-hidden="true" />
          <div className="container editor-page-hero-inner">
            <div className="editor-page-kicker editor-page-reveal">
              <span>Blackbox Editor</span>
              <span>Creator workspace / 0.1</span>
            </div>
            <div className="editor-page-hero-copy">
              <div>
                <h1 className="editor-page-reveal editor-page-delay-1">
                  See the story.
                  <br />
                  Shape every path.
                </h1>
                <p className="editor-page-lead editor-page-reveal editor-page-delay-2">
                  A local-first desktop studio for building Blackbox narrative games, from the first
                  line of dialogue to the last reachable ending.
                </p>
              </div>
              <div className="editor-page-hero-note editor-page-reveal editor-page-delay-3">
                <span>Built for creators</span>
                <p>
                  Work visually without losing the precision of the project&apos;s JSON source. The
                  editor watches real files, preserves revision safety, and runs the same Rust
                  toolchain used to ship the game.
                </p>
              </div>
            </div>
            <div className="editor-page-hero-frame editor-page-reveal editor-page-delay-3">
              <div className="editor-page-frame-bar">
                <span>CHAPTER / STORY GRAPH</span>
                <span>
                  <i />
                  PROJECT READY
                </span>
              </div>
              <div className="editor-page-hero-image">
                <Image
                  src="/editor_graph.webp"
                  alt="Blackbox Editor visual chapter graph with branching narrative nodes"
                  fill
                  priority
                  sizes="(max-width: 767px) 100vw, 1120px"
                />
              </div>
              <div className="editor-page-frame-footer">
                <span>Pan · zoom · connect · inspect</span>
                <span>Analytics lenses available after simulation</span>
              </div>
            </div>
          </div>
        </section>

        <section className="editor-page-section editor-page-story" id="story">
          <div className="container">
            <header className="editor-page-section-head">
              <div>
                <span className="section-label">Narrative authoring</span>
                <h2>Every story system, in reach.</h2>
              </div>
              <p>
                The graph is the spatial overview. A focused inspector holds the details, with typed
                pickers and backlinks keeping references connected across the project.
              </p>
            </header>

            <div className="editor-page-feature-grid">
              {AUTHORING_FEATURES.map((feature) => (
                <article className="editor-page-feature-card" key={feature.index}>
                  <span className="editor-page-feature-index">{feature.index}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                  <div className="editor-page-tags">
                    {feature.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="editor-page-section editor-page-workspace" id="workspace">
          <div className="container">
            <div className="editor-page-split">
              <div className="editor-page-split-copy">
                <span className="section-label">Project workspace</span>
                <h2>Your world, organized around the work.</h2>
                <p>
                  Move between the project dashboard, manifest, graph, catalogs, media, reusable
                  library, tools, and preview from a compact activity rail. Collapsible panels keep
                  the source tree and inspector nearby without crowding the canvas.
                </p>
                <div className="editor-page-workspace-list">
                  {WORKSPACE_FEATURES.map((feature, index) => (
                    <article key={feature.title}>
                      <span>0{index + 1}</span>
                      <div>
                        <h3>{feature.title}</h3>
                        <p>{feature.body}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
              <figure className="editor-page-tall-shot">
                <div className="editor-page-shot-label">
                  <span>CATALOG VIEW</span>
                  <strong>Items & media</strong>
                </div>
                <Image
                  src="/editor_items.webp"
                  alt="Blackbox Editor item catalog with inventory artwork and inspector"
                  fill
                  sizes="(max-width: 899px) 100vw, 48vw"
                />
              </figure>
            </div>
          </div>
        </section>

        <section className="editor-page-section editor-page-preview" id="preview">
          <div className="container">
            <div className="editor-page-preview-grid">
              <figure className="editor-page-preview-shot">
                <Image
                  src="/editor_preview.webp"
                  alt="Blackbox Editor live preview showing Silent Archive with responsive viewport controls and runtime state inspector"
                  fill
                  sizes="(max-width: 899px) 100vw, 52vw"
                />
                <figcaption>
                  Desktop, tablet, and mobile viewports with console, save-state controls, and live
                  runtime inspection.
                </figcaption>
              </figure>
              <div className="editor-page-preview-copy">
                <span className="section-label">Fast feedback</span>
                <h2>Play from source. Save. See it change.</h2>
                <p>
                  Live Preview runs the browser player directly against raw project JSON and media.
                  There is no bundle step between an edit and a playthrough; saving triggers a hot
                  reload, and the same preview can open in a separate browser window.
                </p>
                <ul>
                  <li>Local project folders with recent-project resume</li>
                  <li>Revision-aware saving and on-disk conflict protection</li>
                  <li>Automatic file watching and project refresh</li>
                  <li>Light, dark, or device-matched editor themes</li>
                </ul>
                <div className="editor-page-live-card">
                  <span>
                    <i />
                    LIVE PREVIEW
                  </span>
                  <strong>Raw files → browser player</strong>
                  <small>No production bundle required</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="editor-page-section editor-page-tools" id="tools">
          <div className="container">
            <header className="editor-page-section-head editor-page-section-head--dark">
              <div>
                <span className="section-label">Engine tools</span>
                <h2>Answers, not just output.</h2>
              </div>
              <p>
                Each native tool has a purpose-built editor surface. Results become navigable
                project information instead of a terminal log you have to decode.
              </p>
            </header>
            <div className="editor-page-tools-layout">
              <div className="editor-page-tool-list">
                {TOOLCHAIN.map((tool, index) => (
                  <article key={tool.command}>
                    <span>0{index + 1}</span>
                    <div>
                      <code>{tool.command}</code>
                      <h3>{tool.title}</h3>
                      <p>{tool.body}</p>
                    </div>
                  </article>
                ))}
              </div>
              <figure className="editor-page-tool-shot">
                <Image
                  src="/editor_tools_simulator.webp"
                  alt="Blackbox Editor simulator showing narrative analytics and path coverage"
                  fill
                  sizes="(max-width: 899px) 100vw, 54vw"
                />
              </figure>
            </div>

            <div className="editor-page-analytics">
              <div>
                <span>Simulation feeds authoring</span>
                <h3>Turn playthrough data into a map you can read.</h3>
              </div>
              <p>
                Store a simulator run and the chapter graph gains four analytics lenses: path reach,
                visit frequency, story structure, and ending signatures. Spot mandatory spines,
                recurring loops, cold nodes, and promising branch points in context.
              </p>
              <div className="editor-page-analytics-keys" aria-label="Graph analytics lenses">
                <span>Path reach</span>
                <span>Visit frequency</span>
                <span>Story structure</span>
                <span>Ending signature</span>
              </div>
            </div>
          </div>
        </section>

        <section className="editor-page-final">
          <div className="editor-page-final-grid" aria-hidden="true" />
          <div className="container editor-page-final-inner">
            <span className="section-label">One continuous workflow</span>
            <h2>Write. Connect. Test. Ship.</h2>
            <p>
              Blackbox Editor keeps creative intent, source data, runtime behavior, and release
              validation in the same room.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
