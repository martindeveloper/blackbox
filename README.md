# Blackbox

Blackbox is a narrative engine for text-based RPG and decision games. It loads JSON scenario content, tracks game state, applies effects, and returns read-only views for host applications to render.

The engine is a **pure logic layer** — it does not perform I/O, render UI, or play audio. Hosts (browser, terminal, iOS, Android) load content, submit player commands, handle presentation, and drive their own audio layers.

## What you can build

- Branching story games with inventory, stats, flags, and skill checks
- Multi-chapter adventures with lazy-loaded content and persistent state across chapters
- Cross-platform titles from one scenario folder — web, mobile, and CLI share the same engine rules

The included sample scenario **silent_archive** (`data/silent_archive_game/`) is a branching cyberpunk incident with music cues, conditional gates, skill checks, and multiple endings.

## Features

- **Scenario model** — manifest + chapter graphs, item/character/asset catalogs, optional story catalog and library
- **Game loop** — load content, read `GameView` snapshots, submit `choose` / `continue` commands
- **Effects** — HP, flags, inventory, node transitions, chapter changes, game over
- **Text** — interpolation (`{stat.hp}`, `{item.id}`, `{flag.name}`), conditional lines, dialogue/thought/stage-direction kinds with speaker metadata
- **Gating** — conditional choices with `requires`, `when`, `unless`; enabled/disabled reasons in views
- **Skill checks** — d20 + stat, advantage/disadvantage, attempt limits, outcome branches
- **Expressions & RNG** — deterministic rolls in effects and conditions; all rolls returned in `CommandResult.rolls`
- **Relationships** — per-character metrics usable in gates, effects, expressions, and views
- **Library** — reusable text snippets (`@snippet_id`) and node templates (`$extends`) via optional `library.json`
- **Saves** — serialize and restore game state including RNG seed/counter
- **Validation** — content checked at load time; extended lint rules for authoring and CI
- **Bundling** — cook and pack scenarios for web, iOS, and Android (MessagePack, platform media formats, optional zstd archives)

Authoring reference for scenario JSON: [FEATURES.md](FEATURES.md).

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  Hosts (presentation + I/O)                                 │
│  apps/web   apps/editor   apps/ios   apps/android   cli     │
└───────────────────────────┬─────────────────────────────────┘
                            │ commands / views (JSON)
                            │ content (msgpack bundles)
┌───────────────────────────▼─────────────────────────────────┐
│  Engine (pure logic)                                        │
│  engine/core — state, effects, validation, views            │
│  engine/format — JSON / MessagePack codecs                  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Build & QA tools                                           │
│  engine/bundler   engine/lint   engine/simulator            │
└─────────────────────────────────────────────────────────────┘
```

**Bindings**

| Platform | Crate / path | Host docs |
|----------|--------------|-----------|
| Rust library | `engine/core` (`blackbox`) | this README, [FEATURES.md](FEATURES.md) |
| Web (WASM) | `engine/wasm` | [apps/web/README.md](apps/web/README.md) |
| iOS / Android (C ABI) | `engine/ffi` | [engine/ffi/README.md](engine/ffi/README.md), [apps/ios/README.md](apps/ios/README.md), [apps/android/README.md](apps/android/README.md) |

All hosts use JSON for commands, views, and saves. Web returns owned strings from wasm-bindgen; native mobile uses the stable `bb_*` C exports with caller-allocated buffers.

## Repository layout

```text
blackbox/
  engine/
    core/           Rust engine library (blackbox)
    format/         Wire codecs — JSON / MessagePack (blackbox-format)
    output/         Shared human / JSON CLI output helpers (blackbox-output)
    bundler-cook/   bundle.cook.json parser (blackbox-bundler-cook)
    bundler/        Scenario bundler CLI + library (blackbox-bundler)
    lint/           Scenario linter (blackbox-lint)
    simulator/      State-space simulator and goal search (blackbox-simulator)
    ffi/            Stable C ABI (bb_*) for iOS / Android
    wasm/           Browser WASM (wasm-bindgen)
  apps/
    cli/            Terminal harness and interactive playground
    editor/         Browser / Electron scenario editor
    homepage/       Next.js project homepage
    web/            Browser game client
    ios/            Swift host scaffold (links libblackbox_ffi.a)
    android/        Kotlin + JNI host scaffold (libblackbox_ffi.so)
  data/
    <scenario>/     Per-scenario bundles (JSON, textures, music, sfx, saves/)
  scripts/          Cross-platform engine build scripts (Node .mjs)
  .cache/           Build cache (cargo target, wasm-pack, bundler cook; gitignored)
```

## Parts of the project

| Part | Role | Documentation |
|------|------|---------------|
| **Engine** (`engine/core`) | Game rules, state machine, validation | [FEATURES.md](FEATURES.md) |
| **Web client** (`apps/web`) | React browser host, WASM engine, cooked bundles | [apps/web/README.md](apps/web/README.md) |
| **Editor** (`apps/editor`) | Author scenarios, run lint/simulator/bundler | [apps/editor/README.md](apps/editor/README.md) |
| **Homepage** (`apps/homepage`) | Public project site (Next.js) | — |
| **CLI** (`apps/cli`) | Script branches, interactive terminal play | below |
| **Bundler** (`engine/bundler`) | Validate, encode, cook media, pack boxes | [engine/bundler/README.md](engine/bundler/README.md) |
| **Cook rules** (`engine/bundler-cook`) | `bundle.cook.json` schema and resolution | [engine/bundler-cook/README.md](engine/bundler-cook/README.md) |
| **Linter** (`engine/lint`) | Authoring checks, reachability, CI | [engine/lint/README.md](engine/lint/README.md) |
| **Simulator** (`engine/simulator`) | Explore state space, search for endings | `cargo run -p blackbox-simulator -- --help` |
| **FFI** (`engine/ffi`) | C ABI for native mobile hosts | [engine/ffi/README.md](engine/ffi/README.md) |
| **iOS / Android scaffolds** | Swift / Kotlin wrappers to copy into your app | [apps/ios/README.md](apps/ios/README.md), [apps/android/README.md](apps/android/README.md) |

## Quick start

Get from clone to writing and playtesting a scenario in a few minutes. The sample adventure **silent_archive** lives in `data/silent_archive_game/` if you want something to open right away.

### Requirements

| Tool | Required for | Install |
|------|--------------|---------|
| [Rust](https://rustup.rs) (2024 edition) | Editor tools (lint, bundler, simulator), engine, CLI | `rustup` |
| [Node.js](https://nodejs.org) + npm | Web client and editor | LTS recommended |
| [ffmpeg](https://ffmpeg.org) | Cooking audio and textures when playtesting or bundling | `brew install ffmpeg` / system package manager |
| [wasm-pack](https://rustwasm.github.io/wasm-pack/) | Web client dev builds | `cargo install wasm-pack` |
| cwebp | Optional — preferred WebP encoder when ffmpeg lacks `libwebp` | `brew install webp` |

Mobile builds (iOS / Android) need Xcode or the Android NDK; see the platform READMEs when you ship native apps. On Windows, Android NDK is available via Android Studio (`%LOCALAPPDATA%\\Android\\Sdk`).

### 1. Install app dependencies

From the repository root:

```bash
npm install --prefix apps/editor
npm install --prefix apps/web
```

The first editor or web dev run also compiles Rust engine tools and WASM — allow a few minutes on a cold start.

### 2. Author a scenario

**Desktop editor (recommended)** — open or create a project anywhere on disk (not limited to `data/`):

```bash
npm run electron:dev --prefix apps/editor
```

**Browser editor** — hot reload; discovers projects under `data/` and paths in `BLACKBOX_DATA_ROOT`:

```bash
npm run dev --prefix apps/editor
```

Open [http://localhost:8081](http://localhost:8081). A project is any folder containing `scenario.json` — see [apps/editor/README.md](apps/editor/README.md) for layout, graph editing, and validation.

### 3. Playtest in the browser

```bash
npm run dev --prefix apps/web
```

Open [http://localhost:8080](http://localhost:8080) to run the cooked scenario with the WASM engine. See [apps/web/README.md](apps/web/README.md) for production builds and deploy.

### Engine and CLI (optional)

```bash
cargo test                                                          # engine tests
cargo run -p blackbox-cli -- play data/silent_archive_game/scenario.json  # terminal playthrough
cargo run -p blackbox-lint -- data/silent_archive_game/scenario.json        # validate content
```

## Engine API (Rust)

```rust
use blackbox::{Engine, PlayerCommand};
use blackbox_format::decode_scenario_bundle_json;

let content = decode_scenario_bundle_json(
    scenario,
    items,
    characters,
    assets,
    None::<&[u8]>, // optional catalog
    None::<&[u8]>, // optional library
    chapters,
)?;
let mut engine = Engine::new_game(content)?;

let view = engine.get_current_view()?;
let result = engine.submit_command(PlayerCommand::Choose {
    choice_id: "ask_what_it_prays_to".into(),
});
```

Hosts receive `GameView` snapshots and optional `MusicCue` / `SfxCue` metadata. WASM and FFI surfaces mirror the same revision-checked view/command protocol — see the web and mobile READMEs for host-specific APIs.

## Scenario content

Scenarios live under `data/<name>/` as self-contained folders:

```text
data/my_scenario/
  scenario.json       manifest (chapters, refs, cookRef, …)
  items.json
  characters.json
  assets.json
  library.json        optional snippets and node templates
  chapter_*.json
  textures/  music/  sfx/
  bundle.cook.json    optional per-platform cook rules
  saves/              optional runtime saves (host-specific)
```

Authoring assets (PNG, WAV, MP3) stay as lossless sources in the scenario folder. The bundler cooks them to platform formats at build time. Saves use the same JSON format via `serialize_state` / `restore_state` on any host binding.

Full scripting reference: [FEATURES.md](FEATURES.md).

## Cross-platform builds

Build scripts are Node modules (`.mjs`) and run the same on macOS, Linux, and Windows. You still need Rust and platform-specific toolchains where noted (Xcode for iOS, Android NDK for arm64). `build-all.mjs` skips targets that cannot be built on the current host (for example iOS on Windows).

Build engine libraries for all supported targets on this machine:

```bash
node scripts/build-all.mjs
```

| Script | Output |
|--------|--------|
| `scripts/build-macos-aarch64.mjs` | macOS static library |
| `scripts/build-ios-aarch64.mjs` | `dist/ios-aarch64/libblackbox_ffi.a` |
| `scripts/build-android-aarch64.mjs` | `dist/android-aarch64/libblackbox_ffi.so` |
| `scripts/build-web-wasm.mjs` | Standalone Wasm library in `dist/web-wasm/` |

Platform bundles for mobile:

```bash
cargo run -p blackbox-bundler --release -- \
  data/silent_archive_game/scenario.json \
  --platform ios -o dist/bundle-ios
```

See [engine/bundler/README.md](engine/bundler/README.md) for cook rules, inspect, and web integration.

## License

[MIT](LICENSE)
