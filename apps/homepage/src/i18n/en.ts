export const en = {
  github_url: "https://github.com/martindeveloper/blackbox",
  nav: {
    features: "Features",
    toolchain: "Toolchain",
    architecture: "Architecture",
    editor: "Editor",
    platforms: "Platforms",
    games: "Games",
    theme_light: "Light",
    theme_dark: "Dark",
    theme_auto: "Auto",
  },
  hero: {
    eyebrow: "// text-based narrative RPG engine",
    headline: "BLACKBOX",
    tagline: "Build worlds. Write choices.\nLet the engine handle the rest.",
    description:
      "Blackbox is a pure-logic engine for text-based narrative RPGs. It loads JSON scenario content, tracks every branch and player decision, runs skill checks, and returns clean read-only views — your host app renders exactly what it wants.",
    cta_primary: "Explore Features",
    cta_secondary: "View on GitHub",
  },
  pitch: {
    label: "What is Blackbox?",
    body: "Blackbox separates story logic from presentation entirely. Authors write branching scenarios in JSON — chapters, nodes, gated choices, effects. The Rust engine processes commands, advances state, and returns snapshots. No I/O, no rendering, no audio. Your host owns all of that.",
    stat_platforms: "4",
    stat_platforms_label: "Host Platforms",
    stat_rng: "Deterministic",
    stat_rng_label: "RNG",
    stat_format: "JSON",
    stat_format_label: "Scenario Format",
    stat_core: "Pure Rust",
    stat_core_label: "Engine Core",
  },
  features: {
    label: "Engine Features",
    headline: "Everything the story needs.\nNothing it doesn't.",
    items: [
      {
        id: "narrative",
        title: "Node-Based Story Graph",
        body: "Scenarios are graphs of nodes. Each node carries narrative blocks — dialogue with speaker and emotion, internal monologue, stage directions, and plain paragraphs. Nodes link via choices; the engine walks the graph and returns a view.",
      },
      {
        id: "choices",
        title: "Gated Choices",
        body: "Choices lock behind stat thresholds, flag conditions, item ownership, and visited-node checks. Disabled reasons surface to the player automatically. Per-condition gates can be combined with AND/OR logic.",
      },
      {
        id: "checks",
        title: "Skill Checks",
        body: "D20 rolls: stat + roll vs. difficulty class, with advantage and disadvantage. Seeded deterministic RNG makes every playthrough reproducible. Success and failure branch to different nodes with independent effects.",
      },
      {
        id: "state",
        title: "Rich Persistent State",
        body: "Stats, inventory items, boolean flags, character relationship scores, and visited-node history. All state serialises to JSON for multi-slot saves. Text blocks can interpolate any live value: {stat.logic}, {item.key_card}.",
      },
      {
        id: "platform",
        title: "Cross-Platform Core",
        body: "One Rust codebase compiles to WASM for browsers via wasm-bindgen, a stable C ABI for iOS and Android via cbindgen, and a native binary for CLI tooling — all from the same engine logic.",
      },
      {
        id: "assets",
        title: "Reusable Content",
        body: "Library snippets let authors write a text block once and reference it from any node. Node templates via $extends share base choices and effects. Item and character catalogs are shared across the full scenario.",
      },
    ],
  },
  toolchain: {
    label: "Toolchain",
    headline: "Ship with confidence.",
    body: "Three dedicated tools cover the full author workflow — from writing to validation to production build.",
    items: [
      {
        id: "linter",
        title: "Linter",
        subtitle: "blackbox-lint --strict --format json ./scenarios/",
        body: "Validates scenario bundles before they ship. Catches broken node references, dangling choice targets, missing asset files, malformed gate expressions, and unreachable nodes. Nine rule categories, JSON output, CI-ready exit codes.",
      },
      {
        id: "simulator",
        title: "Simulator",
        subtitle: "blackbox-simulator --check --threads 8 myworld.box",
        body: "Headless multi-threaded playthrough engine. Explores every reachable path in the scenario graph — confirms all endings are reachable, reports narrative hot paths and split-candidate nodes, detects dead ends. Run with --check in CI for a hard gate.",
      },
      {
        id: "bundler",
        title: "Bundler",
        subtitle: "blackbox-bundler build --target web --split-chapters",
        body: "Compiles scenario JSON and raw assets into optimised .box binary bundles. Transcodes PNG→WebP and WAV→Opus (platform-specific bitrates). Converts all JSON documents to MessagePack for lower runtime parse cost. Splits output into a shared bundle and per-chapter bundles so players only download the chapter they need.",
      },
    ],
  },
  architecture: {
    label: "Architecture",
    headline: "Pure logic. Zero coupling.",
    body: "The engine does one thing: take a command, advance state, return a view. No I/O, no rendering, no audio. Your host app owns all of that — the engine just tells it what changed.",
    layers: [
      {
        id: "content",
        label: "Content",
        detail: "JSON scenario bundles — chapters, nodes, choices, effects, audio cues",
      },
      {
        id: "engine",
        label: "Engine",
        detail: "Rust core — state machine, effect evaluator, RNG, validation",
      },
      {
        id: "view",
        label: "View",
        detail: "Read-only snapshots — narrative, choices, stats, inventory, rolls",
      },
      { id: "host", label: "Host", detail: "Your app — React, Swift, Kotlin, terminal, anything" },
    ],
  },
  platforms: {
    label: "Platforms",
    headline: "One engine. Every surface.",
    items: [
      {
        id: "web",
        title: "Web",
        tech: "WASM + React",
        body: "Ship a full browser client. The wasm-bindgen binding crosses the JS boundary with delta-encoded views for minimal allocation overhead.",
      },
      {
        id: "ios",
        title: "iOS & Android",
        tech: "C ABI",
        body: "A stable C foreign-function interface lets Swift and Kotlin call the engine directly — no extra runtime, no managed heap, pure native performance.",
      },
      {
        id: "cli",
        title: "CLI & Tooling",
        tech: "Native binary",
        body: "Run scenarios in the terminal. Pipe JSON in, get JSON out. Pairs with the linter and simulator for fully automated CI pipelines.",
      },
    ],
  },
  snippet: {
    label: "Scenario Format",
    headline: "Author in JSON.\nPlay anywhere.",
    body: "Scenarios are plain JSON — chapters, nodes, conditional text, gated choices, effects. The linter validates your content before it ships.",
  },
  editor: {
    label: "Editor",
    headline: "Author everything\nin one place.",
    body: "Blackbox ships with a desktop editor for building scenario content — node graphs, item libraries, chapter structure, and a live simulator that runs your story end-to-end before it ships.",
    tabs: [
      {
        id: "project",
        label: "Project Picker",
        caption: "Open recent projects or create a new scenario bundle from the launcher.",
        src: "/editor_project_picker.webp",
        alt: "Blackbox Editor project picker screen",
      },
      {
        id: "graph",
        label: "Node Graph",
        caption:
          "Visual chapter flow — every node, branch, and edge visible at once. Orange lines are conditional paths.",
        src: "/editor_graph.webp",
        alt: "Blackbox Editor node graph view showing chapter structure",
      },
      {
        id: "items",
        label: "Items & Media",
        caption:
          "Manage inventory items with art, descriptions, and metadata. Drag to reorder, inspect on the right.",
        src: "/editor_items.webp",
        alt: "Blackbox Editor items and media library",
      },
      {
        id: "simulator",
        label: "Simulator",
        caption:
          "Run the full scenario headlessly. Coverage heatmaps, narrative path analysis, and split-candidate detection.",
        src: "/editor_tools_simulator.webp",
        alt: "Blackbox Editor simulator with narrative analytics",
      },
    ],
  },
  footer: {
    tagline: "Narrative Game Engine",
    copyright: "© 2025 Blackbox Systems",
  },
} as const;
