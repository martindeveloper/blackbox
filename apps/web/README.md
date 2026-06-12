# Blackbox web client

Browser host for the narrative engine. Self-contained under `apps/web/`: TypeScript/React source, build scripts, and deploy output in `dist/`.

Full documentation (features, scenario authoring, engine API) lives in the [repository README](../../README.md#web-client).

## Prerequisites

- [wasm-pack](https://rustwasm.github.io/wasm-pack/) (`cargo install wasm-pack`)
- Node.js and npm
- `ffmpeg` (and optionally `cwebp`) for scenario asset cooking — see [engine/bundler/README.md](../../engine/bundler/README.md)

## Quick start

```bash
# Production build (WASM + cooked bundle + JS/CSS)
npm run build

# Dev server with watch + live reload
npm run dev

# Serve dist/ without rebuild
npm start
```

Open [http://localhost:8080](http://localhost:8080).

## Layout

```txt
apps/web/
  src/
    engine/         Reusable Blackbox browser runtime
    games/
      silent-archive/
                    Silent Archive UI, copy, styling, and presentation rules
    i18n/           Active-game translation bootstrap
    main.tsx        Active-game composition root
  scripts/          WASM, bundler, and dist build scripts
  ../../.cache/wasm/clients-web/
                    wasm-bindgen build cache
  dist/             Deploy root (.vercel/, vercel.json); static site in dist/www/
```

## Common commands

| Command                     | Purpose                                                          |
| --------------------------- | ---------------------------------------------------------------- |
| `npm run build`             | Full release dist                                                |
| `npm run dev`               | Watch + live reload (cooks assets, no zst archive)               |
| `npm run build:wasm`        | Rebuild wasm-bindgen pkg only                                    |
| `npm run build:bundler`     | Cook scenario bundle (release: zstd archive)                     |
| `npm run build:bundler:dev` | Cook scenario bundle (dev: verbose, skip missing assets, no zst) |
| `npm run check`             | Oxlint + Oxfmt check                                             |
| `npm run deploy`            | Clean build + Vercel production deploy                           |
| `npm run test:wasm`         | Smoke-test wasm-bindgen ABI                                      |

## Engine API

wasm-bindgen exports `BlackboxEngine`; core view/save methods use explicit snake_case names, while
streaming content methods use camelCase:

- `new BlackboxEngine(scenario, items, characters, assets, chapters, library?, randomSeedOverride?)`
- `get_current_view()` returns `{ protocol, revision, view }`
- `submit_command(json, viewRevision)` returns a revision-checked view delta
- `loadCatalog(bytes)` / `loadLibrary(bytes)`
- `loadChapter(bytes)` / `unloadChapter(chapterId)`
- `serialize_state()` / `restore_state(json)`

Loader: `src/engine/lib/wasmHost.ts` (`initWasm()`). The adapter in
`src/engine/lib/engine.ts` applies deltas, validates revisions, resynchronizes stale clients before
a single safe retry, and loads or unloads per-chapter bundles during chapter transitions.

## Adding another game

Keep engine protocol, bundle, save, audio, diagnostics, and session lifecycle code in `src/engine/`.
Put game-owned React components, translations, styles, icons, labels, stat presentation, and timing
under `src/games/<game-id>/`. The game passes its notification and timing behavior to
`useBlackboxSession` through `SessionPresentationAdapter`.

To activate a different game, update the game imports in `src/main.tsx`, `src/i18n/index.ts`, and the
CSS input path in `package.json`.

## Bundle layout

`blackbox-bundler` writes `dist/www/bundle/project.box.meta`, a shared bundle, and one bundle per
chapter. The client loads shared content and the starting chapter first, then fetches chapter
bundles on demand. Release builds use the `.box.zst` blobs named by each bundle map; development
builds use uncompressed `.box` files.
