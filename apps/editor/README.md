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
  .blackbox/                 ← editor sidecars (project, layout, VCS, trash, user state)
  src/                       ← optional custom UI (game.ts, app.css, fonts.css)
```

- **Media files** live under `textures/`, `music/`, and `sfx/` in the project folder
- Asset `src` paths in `assets.json` are relative to the project root (e.g. `music/RainOnMonochrome.mp3`)
- **Web fonts** for custom UI shells: `src/fonts.css` (see [apps/web/README.md](../web/README.md#web-fonts))

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

The local server owns all project file access. Each project keeps a shared sidecar for its stable ID and last editor version:

```json
{
  "id": "t4kW7JnHxqw",
  "editorVersion": "0.1.0"
}
```

`id` is an 11-character project identifier. The server generates one when missing.

File: `<project>/.blackbox/project.json` (alongside `layout.json`, `trash.json`, and `trash/`). Machine-specific project state, including optional tool overrides and tool-run history, lives under `<project>/.blackbox/user/` and should be gitignored. No absolute project path is stored.

Version-control provider settings live in `<project>/.blackbox/vcs.json`. This
file contains only a schema version and provider ID (currently `git`) and is
safe to commit. User identity, remotes, SSH keys, credential helpers, and
signing remain owned by the VCS itself. The editor server exposes a
provider-neutral status/operation/history API; Git is the first adapter.
Providers advertise their workflow (`distributed` or `centralized`), supported
operations, terminology, and optional features such as checkout, revert,
changelists, and locking. Shared operations use semantic IDs: `sync` updates
the workspace, `record` creates a revision (Git commit, SVN commit, or Perforce
submit), and optional `publish` sends local revisions upstream. Providers may
also prepare file mutations before the editor writes, allowing systems such as
Perforce to open files for edit/add/delete across UI and MCP saves.

When `.blackbox/vcs.json` is absent, the editor auto-selects and persists the
single provider whose workspace is rooted at the project folder (for example,
an existing `<project>/.git`). An existing `vcs.json` always takes priority.
If no provider is detected, the UI can initialize providers that support it;
if multiple providers are detected, the editor asks the user instead of
guessing.

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

| Command                     | Purpose                                                                    |
| --------------------------- | -------------------------------------------------------------------------- |
| `npm run electron:dev`      | Run the editor in Electron (auto-builds engine tools if missing)           |
| `npm run electron:pack`     | Build UI, icon, and release engine tools for packaging                     |
| `npm run electron:dist`     | Produce `.dmg` (macOS), portable `.zip` (Windows), or AppImage/deb (Linux) |
| `npm run electron:dist:dir` | Unpacked app directory only (faster smoke test)                            |
| `npm run electron:release`  | Build all three desktop platforms, or one selected with `--platform`       |

### Headless CLI (`--cli`)

The packaged editor binary (and `electron .` in development) can run the unified build CLI without opening a window. This is intended for CI and scripted builds: stdout/stderr are inherited, and the process exits with the CLI exit code.

```bash
# Packaged binary
BlackboxEditor --cli build --project=./my-game --platform=web --configuration=release
BlackboxEditor --cli package --project=./my-game --platform=ios

# Optional POSIX `--` separator before CLI args
BlackboxEditor --cli -- lint --project=./my-game --platform=web

# Full CLI reference (actions, platforms, scenario.json platform config)
BlackboxEditor --cli --help

# Development
npm run electron:dev -- --cli build --project=../../data/silent_archive_game --platform=web
```

Actions match the repository CLI (`prepare`, `lint`, `build`, `bundle`, `package`). In a packaged build the editor supplies bundled `blackbox-lint` / `blackbox-bundler`, the staged CLI under `resources/cli`, and prebuilt WASM — no repository checkout or Rust toolchain required on the runner. Mobile packaging still needs the host SDKs (Xcode for iOS, Android Studio / JDK for Android).

Example CI step:

```yaml
- name: Build web release
  run: |
    BlackboxEditor --cli build \
      --project="${{ github.workspace }}/games/my-adventure" \
      --platform=web \
      --configuration=release
```

On Windows, run `BlackboxEditor.exe --cli build --project=C:\game --platform=web`.

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
packages as a workflow artifact retained for 14 days. Linux and Windows use an Ubuntu runner;
only the macOS workflow consumes a macOS runner.

The manually triggered **Editor Release** workflow runs five builds in parallel and creates one
GitHub Release containing macOS ARM64 and x64 DMGs, Windows ARM64 and x64 ZIPs, and Linux x64
AppImage and DEB packages. It also publishes a `SHA256SUMS` manifest for verifying downloads.
Enter a new tag such as `v0.1.0` and optionally create a draft or prerelease. The release tag
targets the exact commit from which the workflow was started.

In the desktop app, use **Open project** on the welcome screen to pick any folder that contains `scenario.json`. Project registry, preferences, and bundle cache live in the app user-data folder instead of the repository `.blackbox/` directory.
