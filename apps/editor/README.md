# Blackbox Editor

Browser-based authoring tool for Blackbox game projects. Edit the manifest (`scenario.json`), chapter graphs, items, characters, and assets via structured forms. Browse and preview raw media files in the project folder.

## Quick start

```bash
cd apps/editor
npm install
npm run dev
```

Open [http://localhost:8081](http://localhost:8081) and select a discovered project. The server scans `BLACKBOX_DATA_ROOT`, `BLACKBOX_DATA_ROOTS`, and the repository `data/` directory for folders containing `scenario.json`.

## Project layout

A **project** is one game. It contains the manifest, chapters, catalogs, media, and editor sidecars:

```
silent_archive_game/     ← project root (open this folder)
  scenario.json              ← manifest
  chapter_*.json
  items.json
  characters.json
  assets.json
  textures/
  music/
  sfx/
  saves/                     ← optional runtime save files
  .blackbox/                 ← editor sidecars (layout, trash, editor.json)
```

- **Media files** live under `textures/`, `music/`, and `sfx/` in the project folder
- Asset `src` paths in `assets.json` are relative to the project root (e.g. `music/RainOnMonochrome.mp3`)

## Features

- Neutral editor UI with light, dark, and device themes (saved through the local preferences API)
- Open one project at a time; the top bar shows the game title from the manifest
- **Files** view: browse textures/music/sfx on disk, preview images and audio, import and delete files
- Three-column layout: activity bar + navigator, main canvas, inspector
- Chapter graph editor with drag-and-drop layout (saved to `.blackbox/layout.json`)
- Structured editors for nodes, choices, gates, conditions, and effects
- Items, characters, asset **Catalog**, story catalog (`catalog.json`), and reusable library views
- Reference-aware rename/delete workflows for assets, story metadata, and library entries
- Client-side validation with click-to-navigate issues
- Save via toolbar or Ctrl/Cmd+S through the local project API
- File watching with revision conflicts for external edits and concurrent clients
- **Tools** tab: run the linter, simulator, bundle build, and bundle inspection

## Project API and engine tools

The local server owns all project file access. Each project keeps a sidecar for its stable ID and optional tool configuration:

```json
{
  "id": "t4kW7JnHxqw",
  "path": "/absolute/path/to/blackbox/data/silent_archive_game"
}
```

`id` is an 11-character project identifier. The server generates one when missing.

File: `<project>/.blackbox/editor.json` (alongside `layout.json`, `trash.json`, and `trash/`). Project files, media, trash, lint, and bundle operations all use the stable project ID through `/api/v1/projects/:id`.

The server stores its project registry, revisions, and file index in
`<user-data>/.blackbox/editor.db`, plus UI preferences in
`<user-data>/.blackbox/user.preferences.json`. In repository development, `<user-data>` defaults
to the repository root; packaged Electron builds use the OS application-data directory.

## Full validation

```bash
cargo run -p blackbox-lint -- data/silent_archive_game/scenario.json
```

## Build

```bash
npm run build
npm start
```

`npm start` serves the already-built `dist/` directory on
[http://localhost:8081](http://localhost:8081). Use `npm run dev` for rebuilds, watches, and live
reload.

## Desktop app (Electron)

The editor can be packaged as a self-contained desktop app. Electron hosts the same Fastify API and React UI over a private OS IPC socket, stores editor state under the OS user-data directory, and bundles release builds of `blackbox-lint`, `blackbox-bundler`, and `blackbox-simulator`. Electron does not open a TCP port; browser access on `localhost:8081` is reserved for `npm run dev` and `npm start`.

```bash
cd apps/editor
npm install   # also ensures the Electron binary is present

# Local desktop run (builds UI + engine tools if missing, starts embedded server + window)
npm run electron:dev

# Full distributable (UI + bundled lint/bundler/simulator + platform installer)
npm run electron:dist

# Cross-compile and package macOS, Linux, and Windows releases from macOS
npm run electron:release

# Build one platform only
npm run electron:release -- --platform windows

# Select x64 or ARM64
npm run electron:release -- --platform windows --arch arm64
```

Installers and unpacked builds are written to `apps/editor/release/`.

| Command                        | Purpose                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `npm run electron:dev`         | Run the editor in Electron (auto-builds engine tools if missing)                   |
| `npm run electron:build:tools` | Build and copy Rust engine CLIs into `resources/bin/`                              |
| `npm run electron:pack`        | Build UI, icon, and release engine tools for packaging                             |
| `npm run electron:dist`        | Produce `.dmg`/`.zip` (macOS), `.exe` installer (Windows), or AppImage/deb (Linux) |
| `npm run electron:dist:dir`    | Unpacked app directory only (faster smoke test)                                    |
| `npm run electron:release`     | Build all three desktop platforms, or one selected with `--platform`               |

The cross-platform release command must run on macOS because Apple packages require the macOS
SDK. It supports x64 and ARM64 targets for macOS, Linux, and Windows. Install
[Zig](https://ziglang.org/download/) for the Linux linker. Windows uses the MSVC target through
[`cargo-xwin`](https://github.com/rust-cross/cargo-xwin), installed with
`cargo install --locked cargo-xwin`. A full LLVM install (`brew install llvm`) is recommended if
Apple Clang cannot build a dependency. Electron Builder may also download platform packaging tools
on the first run. Accepted platform values are `all`, `macos`, `linux`, and `windows` (`mac`,
`darwin`, `win`, and `win32` are aliases).

## GitHub Actions releases

The repository has separate manually triggered Actions workflows for macOS, Linux, and Windows. In
the GitHub **Actions** tab, select the desired workflow, choose **Run workflow**, and select `x64`
or `arm64`. The defaults are macOS ARM64, Linux x64, and Windows x64. Each run uploads its
installers as a workflow artifact retained for 14 days. Linux and Windows use an Ubuntu runner;
only the macOS workflow consumes a macOS runner.

In the desktop app, use **Open project** on the welcome screen to pick any folder that contains `scenario.json`. Project registry, preferences, and bundle cache live in the app user-data folder instead of the repository `.blackbox/` directory.
