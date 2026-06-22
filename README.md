# Blackbox

**Build branching story games visually, then ship them anywhere.**

Blackbox is an open-source engine and desktop editor for narrative RPGs and decision games. Create
chapters as node graphs, add choices, characters, inventory, stats, skill checks, music, and
multiple endings, then playtest and validate the whole story from one project.

Your game content stays in portable JSON files. The same story can power web, terminal, iOS, and
Android experiences without rewriting its rules.

## What's included

| Part | What it does |
|------|--------------|
| **Desktop editor** | Visually creates chapters, choices, characters, items, media, and game rules |
| **Engine** | Runs the story, tracks state, applies effects, performs skill checks, and handles saves |
| **Web player** | Plays a Blackbox game in the browser |
| **CLI** | Plays and tests stories from the terminal |
| **Linter** | Finds broken references, unreachable content, and authoring mistakes |
| **Simulator** | Explores story paths and searches for endings |
| **Bundler** | Prepares content and media for web, iOS, and Android |

## Quick start

### Requirements

- [Node.js](https://nodejs.org) LTS with npm
- [Rust](https://rustup.rs)

On macOS:

```bash
brew install node rustup
rustup-init
```

On Windows:

```powershell
winget install OpenJS.NodeJS.LTS Rustlang.Rustup
```

On Linux, use your distribution's package manager.

### Open the desktop editor

From the repository root:

```bash
node cli.js prepare
npm run electron:dev --prefix apps/editor
```

`prepare` installs npm dependencies (web, mobile, editor), fetches Rust crates, adds the
`wasm32-unknown-unknown` target when needed, then verifies `node`, `npm`, `rustc`, and `cargo`
are available. Media conversion is built into the Rust toolchain and requires no system codecs.

The first editor launch builds engine tools, so it can take a few minutes.

### Create your first project

1. Click **New project**.
2. Enter the game title and folder name.
3. Name the opening chapter.
4. Choose where the project folder should be created.
5. Click **Create project** and start building the chapter graph.

Prefer to explore first? Click **Open project folder** and select
`data/silent_archive_game`, the included cyberpunk sample adventure.

## How projects work

Each game is a self-contained folder:

```text
my_game/
  scenario.json       game manifest
  chapter_*.json      story chapters and node graphs
  items.json          inventory definitions
  characters.json     character definitions
  assets.json         images, music, and sound effects
  textures/
  music/
  sfx/
```

Blackbox keeps the engine separate from presentation. Your host app renders the interface and plays
audio; the engine provides the current scene, available choices, and updated game state.

## More documentation

- [Editor guide](apps/editor/README.md) — editor features, browser mode, and desktop packaging
- [Authoring reference](FEATURES.md) — choices, effects, conditions, skill checks, and saves
- [Web player](apps/web/README.md) — browser playtesting and production builds
- [Bundler](engine/bundler/README.md) — content validation and platform bundles
- [iOS](apps/ios/README.md) and [Android](apps/android/README.md) — native host integration

## Developer commands

```bash
npm run dev --prefix apps/web
cargo test
cargo run -p blackbox-cli -- play data/silent_archive_game/scenario.json
cargo run -p blackbox-lint -- data/silent_archive_game/scenario.json
```

The web player runs at [http://localhost:8080](http://localhost:8080).

## License

[MIT](LICENSE)
