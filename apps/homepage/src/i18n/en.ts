export const en = {
  github_url: "https://github.com/martindeveloper/blackbox",
  brand: {
    wordmark_black: "BLACK",
    wordmark_box: "BOX",
  },
  metadata: {
    siteName: "Blackbox",
    title: {
      default: "Blackbox",
      template: "%s | Blackbox",
    },
    description:
      "Build choice-driven narrative games with Blackbox, a text-based RPG engine for branching stories, persistent state, and cross-platform play.",
    openGraph: {
      title: "Blackbox — Text-Based Narrative RPG Engine",
      description:
        "Build worlds. Write choices. Let Blackbox handle branching stories, persistent state, and cross-platform play.",
    },
    twitter: {
      title: "Blackbox — Text-Based Narrative RPG Engine",
      description:
        "Build worlds. Write choices. Let Blackbox handle branching stories, persistent state, and cross-platform play.",
    },
    games: {
      title: "Games",
      description:
        "Explore choice-driven narrative games built with Blackbox, where every decision leaves a trace.",
      openGraph: {
        title: "Blackbox Games — Choice Leaves a Trace",
        description:
          "Explore choice-driven narrative games built with Blackbox, where every decision leaves a trace.",
        imageAlt: "Blackbox Games — Choice Leaves a Trace",
      },
      twitter: {
        title: "Blackbox Games — Choice Leaves a Trace",
        description:
          "Explore choice-driven narrative games built with Blackbox, where every decision leaves a trace.",
      },
    },
    silentArchive: {
      title: "Silent Archive",
      description:
        "Enter Archive Complex 7-Meridian in Silent Archive, a dark sci-fi noir narrative RPG built with Blackbox.",
      openGraph: {
        title: "Silent Archive — A Blackbox Narrative RPG",
        description:
          "Investigate Archive Complex 7-Meridian in a choice-driven dark sci-fi noir narrative.",
        imageAlt: "Silent Archive — Archive Complex 7-Meridian",
      },
      twitter: {
        title: "Silent Archive — A Blackbox Narrative RPG",
        description:
          "Investigate Archive Complex 7-Meridian in a choice-driven dark sci-fi noir narrative.",
      },
    },
    editorPage: {
      title: "Editor",
      description:
        "Explore Blackbox Editor, a local-first visual workspace for authoring, previewing, validating, simulating, and bundling narrative game projects.",
      openGraph: {
        title: "Blackbox Editor",
        description:
          "Shape branching stories visually, preview from source, and validate every path with the Blackbox Rust toolchain.",
      },
    },
    download: {
      title: "Download",
      description:
        "Download Blackbox Editor for macOS, Windows, and Linux. Choose your platform and architecture to get the latest release.",
      openGraph: {
        title: "Download Blackbox Editor",
        description:
          "Get the local-first narrative authoring workspace for macOS, Windows, and Linux.",
      },
      twitter: {
        title: "Download Blackbox Editor",
        description:
          "Get the local-first narrative authoring workspace for macOS, Windows, and Linux.",
      },
    },
  },
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
    home_aria: "Blackbox home",
    theme_title: "{{label}} — click to change",
    theme_aria: "{{label}}, click to change theme",
    pages: {
      games: [
        { href: "#releases", label: "Releases" },
        { href: "/#features", label: "Engine" },
        { href: "/#editor", label: "Editor" },
      ],
      silentArchive: [
        { href: "#archive", label: "Archive" },
        { href: "#briefing", label: "Briefing" },
        { href: "#evidence", label: "Evidence" },
      ],
      editorPage: [
        { href: "#story", label: "Authoring" },
        { href: "#workspace", label: "Workspace" },
        { href: "#preview", label: "Preview" },
        { href: "#tools", label: "Tools" },
      ],
      download: [
        { href: "#download", label: "Download" },
        { href: "/editor", label: "Editor" },
        { href: "/#features", label: "Engine" },
      ],
    },
  },
  hero: {
    eyebrow: "// text-based narrative RPG engine",
    headline: "BLACKBOX",
    tagline: "Build worlds. Write choices.\nLet the engine handle the rest.",
    description:
      "Blackbox is a pure-logic engine for text-based narrative RPGs. It loads JSON scenario content, tracks every branch and player decision, runs skill checks, and returns clean read-only views — your host app renders exactly what it wants.",
    cta_primary: "Explore Features",
    cta_download: "Download Editor",
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
    diagram: {
      frame_left: "BBX / CORE CONTRACT",
      frame_right: "DETERMINISTIC",
      host_tag: "I/O · RENDER · AUDIO",
    },
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
    filename: "node.json",
    code: `{
  "id": "investigation_begin",
  "narrative": [
    {
      "text": "The corridor is silent. Water drips somewhere below."
    },
    {
      "speaker": "CASE",
      "text": "Your access log shows no movement on this floor for fourteen months.",
      "emotion": "neutral",
      "side": "left"
    }
  ],
  "choices": [
    {
      "text": "Check the security terminal.",
      "effects": [
        { "type": "stat", "key": "logic", "delta": 1 }
      ]
    },
    {
      "text": "Proceed to the lower ward.",
      "requires": { "stat": "conviction", "gte": 3 }
    },
    {
      "text": "[SKILL CHECK] Force the door. (STR · DC 14)",
      "check": { "stat": "strength", "dc": 14 },
      "on_success": "lower_ward_forced",
      "on_failure": "door_holds"
    }
  ]
}`,
  },
  editor: {
    label: "Editor",
    headline: "Author everything\nin one place.",
    body: "Blackbox ships with a desktop editor for building scenario content — node graphs, item libraries, chapter structure, and a live simulator that runs your story end-to-end before it ships.",
    showcase: {
      tour_link: {
        kicker: "Editor tour",
        title: "Explore every editor feature",
      },
      canvas: {
        header: "BLACKBOX / EDITOR",
        status: "WORKSPACE ONLINE",
      },
      primary_kicker: "01 / STORY MAP",
      supporting_heading: "SUPPORTING VIEWS",
      supporting_count: "{{current}} / {{total}}",
    },
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
  heroGraph: {
    nodes: [
      { id: "start", sid: "prologue_arrival", title: "Prologue · Arrival", meta: "1 choice" },
      { id: "archive", sid: "archive_terminal", title: "Archive Terminal", meta: "3 choices" },
      { id: "security", sid: "security_door", title: "Security Door", meta: "2 choices" },
      {
        id: "tunnels",
        sid: "lower_service_tunn…",
        title: "Lower Service Tunnels",
        meta: "5 choices",
      },
      {
        id: "chapel",
        sid: "chapel_hatch_seq…",
        title: "Chapel Hatch Sequence",
        meta: "4 choices",
      },
      { id: "server", sid: "server_room", title: "Server Room", meta: "2 choices" },
      {
        id: "shepherd",
        sid: "ending_last_shepherd",
        title: "Last Shepherd",
        meta: "168 states · 62 ch",
      },
      {
        id: "question",
        sid: "ending_open_question",
        title: "Open Question",
        meta: "161 states · 64 ch",
      },
      {
        id: "protocol",
        sid: "ending_protocol_main…",
        title: "Protocol Maintained",
        meta: "142 states · 61 ch",
      },
      {
        id: "witness",
        sid: "ending_witness_proto…",
        title: "Witness Protocol",
        meta: "200 states · 77 ch",
      },
    ],
    edges: [
      { from: "start", to: "archive", label: "Enter archive" },
      { from: "start", to: "security", label: "Check door" },
      { from: "archive", to: "tunnels", label: "Descend stairs" },
      { from: "security", to: "chapel", label: "Pass — Whisper" },
      { from: "security", to: "server", label: "Fail — Force" },
      { from: "tunnels", to: "shepherd", label: "Unlock hatch" },
      { from: "tunnels", to: "question", label: "Wait" },
      { from: "chapel", to: "question", label: "Confess" },
      { from: "chapel", to: "protocol", label: "Comply" },
      { from: "server", to: "protocol", label: "Bridge net" },
      { from: "server", to: "witness", label: "Broadcast" },
    ],
  },
  gamesIndex: {
    eyebrow: {
      brand: "Blackbox Games",
      catalog: "Catalog 001",
    },
    headline: "Stories that\nremember you.",
    description:
      "Choice-driven worlds built on the Blackbox narrative engine. Every decision is state. Every consequence stays written.",
    ledger_aria: "Catalog summary",
    ledger: ["01 published work", "07 chapters", "Browser playable", "More records pending"],
    catalog: {
      heading: "Current releases",
      subheading: "Open an entry to inspect the case file.",
    },
    silentArchive: {
      image_alt: "Archive Complex 7-Meridian above a rain-soaked industrial city",
      number: "001",
      status: "Case file open",
      tags: ["Dark sci-fi noir", "Narrative RPG", "Play in browser"],
      location: "Archive Complex 7-Meridian",
      title: "Silent Archive",
      subtitle: "Every Record Remembers",
      description:
        "A company investigator enters a facility that has been silent for fourteen months. Explore the complex, examine incomplete records, and file a report shaped by your choices.",
      explore: "Explore the case",
      play: "Play now",
      play_url: "https://silentarchive.onbbx.com",
    },
    pending: {
      number: "002",
      message: "Next transmission not yet cleared for release.",
      label: "Record pending",
    },
  },
  silentArchive: {
    game_url: "https://silentarchive.onbbx.com",
    hero: {
      image_alt: "Archive Complex 7-Meridian rising above a rain-soaked industrial city",
      kicker: {
        release: "Blackbox release 001",
        status: "Case file open",
      },
      location: "Archive Complex\n7-Meridian",
      title: "Silent\nArchive",
      subtitle: "Every Record Remembers",
      thesis: "Fourteen months without contact.\nOne report still waiting to be written.",
      telemetry_aria: "Archive telemetry",
      telemetry: [
        { label: "Signal", value: "Recovered" },
        { label: "Occupancy", value: "Unknown" },
        { label: "Last contact", value: "14 mo." },
      ],
      status: "Investigation active",
      cta: "Enter the archive",
    },
    briefing: {
      index: "01 / Investigation brief",
      tags: "Dark sci-fi noir · Narrative RPG · Play in browser",
      content_warning: {
        label: "Content warning",
        body: "This game explores psychological distress, institutional abuse, confinement, death, assisted dying, identity disturbance, and morally difficult choices.",
      },
      stamp: "Meridian Cognitive Systems",
      headline: "You were sent to file a report. Your brief ends at the entrance.",
      copy: [
        "Archive Complex 7-Meridian has been dark for fourteen months. No personnel contact. No maintenance pings. No distress signals. You are CASE, a company investigator sent to enter the facility, establish the facts, and file a final report.",
        "Descend through a facility that still preserves, classifies, and obeys. Follow maintenance logs, fractured testimony, and systems carrying out old orders; then decide what belongs in the record, and what its language was built to leave out.",
      ],
      question:
        "When every record is technically correct, what has the system decided not to name?",
      facts: [
        { label: "Format", value: "Choice-driven narrative" },
        { label: "Setting", value: "Corporate legal horror" },
        { label: "Case status", value: "Unresolved" },
        { label: "Powered by", value: "Blackbox Engine" },
      ],
    },
    transmission: {
      aria: "Recovered archive transmission",
      image_alt:
        "CASE and the maintenance synthetic VESPER standing among preserved records inside Archive Complex 7-Meridian",
      case: "7-Meridian",
      meta: ["Recovered visual / 7MER-001", "Source integrity uncertain"],
      label: "First witness · Maintenance record",
      quote: "Someone should know they were here.",
      note: "The first witness CASE finds has spent fourteen months filing reports into a system that no longer answers. It calls the work maintenance.",
      footer: ["Visual record 001 / 07", "Distribution restricted"],
    },
    evidence: {
      index: "02 / Recovered evidence",
      subheading: "Selected locations · Spoiler-safe archive",
      visual_record: "Visual record",
      items: [
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
          note: "Cognitive archive. Fiber-optic light climbs through long-term storage like vines. The room looks almost alive; its records were built to outlast their readers.",
        },
      ],
    },
    final: {
      index: "03 / Authorization requested",
      headline: "The report is blank. The conclusion is yours.",
      copy: "Follow the records. Question the categories. Decide what belongs in the final report — and what the report is allowed to call true.",
      cta: "Play Silent Archive",
      external: "silentarchive.onbbx.com",
    },
  },
  editorPage: {
    hero: {
      kicker: {
        brand: "Blackbox Editor",
        version: "Creator workspace / 0.1",
      },
      headline: "See the story.\nShape every path.",
      lead: "A local-first desktop studio for building Blackbox narrative games, from the first line of dialogue to the last reachable ending.",
      note: {
        label: "Built for creators",
        body: "Work visually without losing the precision of the project's JSON source. The editor watches real files, preserves revision safety, and runs the same Rust toolchain used to ship the game.",
      },
      frame: {
        bar: "CHAPTER / STORY GRAPH",
        status: "PROJECT READY",
        image_alt: "Blackbox Editor visual chapter graph with branching narrative nodes",
        footer: ["Pan · zoom · connect · inspect", "Analytics lenses available after simulation"],
      },
    },
    story: {
      label: "Narrative authoring",
      headline: "Every story system, in reach.",
      body: "The graph is the spatial overview. A focused inspector holds the details, with typed pickers and backlinks keeping references connected across the project.",
      features: [
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
      ],
    },
    workspace: {
      label: "Project workspace",
      headline: "Your world, organized around the work.",
      body: "Move between the project dashboard, manifest, graph, catalogs, media, reusable library, tools, and preview from a compact activity rail. Collapsible panels keep the source tree and inspector nearby without crowding the canvas.",
      features: [
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
      ],
      shot: {
        label: "CATALOG VIEW",
        title: "Items & media",
        alt: "Blackbox Editor item catalog with inventory artwork and inspector",
      },
    },
    preview: {
      alt: "Blackbox Editor live preview showing Silent Archive with responsive viewport controls and runtime state inspector",
      caption:
        "Desktop, tablet, and mobile viewports with console, save-state controls, and live runtime inspection.",
      label: "Fast feedback",
      headline: "Play from source. Save. See it change.",
      body: "Live Preview runs the browser player directly against raw project JSON and media. There is no bundle step between an edit and a playthrough; saving triggers a hot reload, and the same preview can open in a separate browser window.",
      bullets: [
        "Local project folders with recent-project resume",
        "Revision-aware saving and on-disk conflict protection",
        "Automatic file watching and project refresh",
        "Light, dark, or device-matched editor themes",
      ],
      liveCard: {
        label: "LIVE PREVIEW",
        title: "Raw files → browser player",
        subtitle: "No production bundle required",
      },
    },
    tools: {
      label: "Engine tools",
      headline: "Answers, not just output.",
      body: "Each native tool has a purpose-built editor surface. Results become navigable project information instead of a terminal log you have to decode.",
      items: [
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
      ],
      shot_alt: "Blackbox Editor simulator showing narrative analytics and path coverage",
      analytics: {
        label: "Simulation feeds authoring",
        headline: "Turn playthrough data into a map you can read.",
        body: "Store a simulator run and the chapter graph gains four analytics lenses: path reach, visit frequency, story structure, and ending signatures. Spot mandatory spines, recurring loops, cold nodes, and promising branch points in context.",
        lenses_aria: "Graph analytics lenses",
        lenses: ["Path reach", "Visit frequency", "Story structure", "Ending signature"],
      },
    },
    mcp: {
      label: "Agent interface",
      headline: "Let AI agents work inside the editor.",
      body: "Blackbox Editor exposes a local Model Context Protocol server, giving compatible agents a structured, revision-safe way to understand and operate on narrative projects.",
      intro:
        "Instead of driving the interface or editing files blindly, agents use the same project service, validation rules, and native tools as the editor itself.",
      capabilities: [
        {
          title: "Read the narrative model",
          body: "Inspect projects, chapters, nodes, catalogs, and references as structured context without exposing unrestricted filesystem access.",
        },
        {
          title: "Author with revision safety",
          body: "Save authored JSON through atomic, revision-checked mutations. Unsaved editor changes block agent writes before work can collide.",
        },
        {
          title: "Validate through the engine",
          body: "Run lint and simulation tools, search story content, and investigate unreachable paths through focused MCP operations.",
        },
      ],
      security: {
        label: "Local by design",
        body: "Disabled by default. The server binds only to localhost, requires a rotating bearer token, and keeps a persistent metadata-only audit trail beside the editor log.",
      },
      console: {
        aria: "Blackbox Editor MCP connection and audit visualization",
        title: "BLACKBOX / AGENT BRIDGE",
        status: "LOCAL ENDPOINT READY",
      },
      flow: {
        agent: "AI agent",
        agentMeta: "Codex · Claude · MCP client",
        protocol: "MCP transport",
        editor: "Editor services",
        editorMeta: "Projects · lint · simulate",
      },
      audit: {
        label: "MCP AUDIT",
        title: "Every operation leaves a receipt.",
        items: [
          "read_project · silent_archive",
          "lint_project · revision 42",
          "save_documents · chapter_03.json",
        ],
      },
    },
    final: {
      label: "One continuous workflow",
      headline: "Write. Connect. Test. Ship.",
      body: "Blackbox Editor keeps creative intent, source data, runtime behavior, and release validation in the same room.",
    },
  },
  downloadPage: {
    hero: {
      kicker: {
        product: "Blackbox Editor",
        channel: "Release channel",
        pinned: "Pinned · {{version}}",
      },
      headline: "Pick your\nbuild.",
      description:
        "Desktop builds for macOS, Windows, and Linux. Select platform and architecture — links point to GitHub Releases once CI publishes them.",
    },
    selector: {
      platform_label: "Platform",
      platform_aria: "Select download platform",
      arch_label: "Architecture",
      arch_aria: "Select CPU architecture",
      format_label: "Package format",
      format_aria: "Select Linux package format",
    },
    platforms: {
      macos: "macOS",
      macos_meta: ".dmg · unsigned .app",
      windows: "Windows",
      windows_meta: ".msix + .cer bundle",
      linux: "Linux",
      linux_meta: "x64 only",
    },
    arch: {
      macos: {
        arm64: "Apple Silicon",
        x64: "Intel",
      },
      windows: {
        arm64: "ARM64",
        x64: "x64",
      },
    },
    format: {
      appimage: "AppImage",
      deb: "Debian package",
    },
    download_cta: "Download for",
    file_note:
      "Hosted on GitHub Releases. macOS and Windows builds are not notarized or commercially signed yet — see the install guide below.",
    alternate_format: "Also available as",
    requirements_aria: "System requirements",
    requirements: {
      macos: [
        "macOS 12 Monterey or later",
        "Apple Silicon or Intel processor",
        "Gatekeeper may block the unsigned .app until you trust it locally",
        "~400 MB disk space",
      ],
      windows: [
        "Windows 10 version 1809 or later",
        "ARM64 or x64 processor",
        "MSIX sideload bundle includes msix-signing.cer — trust it before install",
        "~400 MB disk space",
      ],
      linux: [
        "Ubuntu 22.04, Fedora 38, or equivalent",
        "x64 processor",
        "AppImage: FUSE recommended · deb: apt install",
      ],
    },
    checksums: "SHA256 checksums",
    all_releases: "All releases on GitHub",
    outdated_notice: {
      label: "Stale build",
      title: "{{latest}} is out — you're still on {{requested}}",
      body: "Download links below point to {{requested}}. Switch to the latest build unless you need this specific release.",
      cta: "Get {{latest}}",
    },
    unsigned: {
      macos: {
        title: "Unsigned macOS build",
        note: "The .app inside the DMG is not Apple-notarized or Developer ID signed yet. macOS may refuse to open it until you remove quarantine attributes and apply a local ad-hoc signature.",
        steps: [
          "Download and open the .dmg, then drag Blackbox Editor.app to Applications.",
          "Run the commands below in Terminal (adjust the path if you installed elsewhere).",
          "Open the app from Applications or Spotlight.",
        ],
        shell_filename: "trust-app.sh",
        commands: `# trust the unsigned app locally
APP="/Applications/Blackbox Editor.app"

xattr -dr com.apple.quarantine "$APP"
codesign --force --deep --sign - "$APP"`,
      },
      windows: {
        title: "Self-signed MSIX sideload",
        note: "The MSIX package is signed with a development certificate that Windows does not trust by default. Each release bundle ships msix-signing.cer — install that certificate before Add-AppxPackage will succeed.",
        steps: [
          "Download and extract the sideload .zip (contains the .msix, msix-signing.cer, and helper scripts).",
          "Open PowerShell as Administrator in that folder.",
          "Trust the certificate, then install the MSIX package.",
        ],
        bundled_hint:
          "Prefer the bundled install-msix-sideload.cmd in the zip — it runs the same steps with UAC elevation.",
        shell_filename: "install-msix-sideload.ps1",
        commands: `# run in elevated PowerShell from the extracted bundle folder
Import-Certificate \`
  -FilePath .\\msix-signing.cer \`
  -CertStoreLocation Cert:\\LocalMachine\\TrustedPeople

Add-AppxPackage -Path (Get-ChildItem .\\*.msix | Select-Object -First 1).FullName`,
      },
    },
  },
} as const;
