# Blackbox web client

Browser host for the narrative engine. Self-contained under `apps/web/`: TypeScript/React source, build scripts, and deploy output in `dist/`.

Full documentation (features, scenario authoring, engine API) lives in the [repository README](../../README.md#web-client).

## Prerequisites

- [wasm-pack](https://rustwasm.github.io/wasm-pack/) (`cargo install wasm-pack`)
- Node.js and npm
- Built-in Rust media conversion for scenario asset cooking — see [engine/bundler/README.md](../../engine/bundler/README.md)

## Quick start

```bash
# Production build (WASM + cooked bundle + JS/CSS)
BLACKBOX_ADVENTURE=../../data/my_game npm run build

# Dev server with watch + live reload
BLACKBOX_ADVENTURE=../../data/my_game npm run dev

# Serve the built site without rebuild
BLACKBOX_ADVENTURE=../../data/my_game npm start
```

Open [http://localhost:8080](http://localhost:8080).

## Layout

```txt
apps/web/
  src/
    engine/         Reusable Blackbox browser runtime
    preview/        Editor preview entry
    main.tsx        Active-game composition root
  scripts/          WASM, bundler, and dist build scripts
  ../../data/<game-id>/src/
                    Game UI, copy, styling, and presentation rules
  src/shells/editor-preview/
                    Built-in generic UI when a project has no custom shell
  ../../.cache/wasm/clients-web/
                    wasm-bindgen build cache
  ../../data/<game-id>/.blackbox/build/<configuration>/
                    Per-project build output (debug/ or release/)
```

All web build artifacts land under `<adventure>/.blackbox/build/<configuration>/` — never in `apps/web/dist/`.
Use `debug` for dev tooling (in-game console via `__BLACKBOX_DEV__`); `release` for production packages and deploy.

```txt
<adventure>/.blackbox/build/release/
  web/
    vercel.json       Copied from apps/web/vercel.json at build time
    www/              Static site served locally and deployed to Vercel
      app.js
      style.css
      index.html
      pkg/
      bundle/
      favicon.*
```

## Common commands

| Command                     | Purpose                                                                    |
| --------------------------- | -------------------------------------------------------------------------- |
| `npm run build`             | Full release dist; requires `BLACKBOX_ADVENTURE`                           |
| `npm run dev`               | Watch + live reload; requires `BLACKBOX_ADVENTURE`                         |
| `npm run build:wasm`        | Rebuild wasm-bindgen pkg only                                              |
| `npm run build:bundler`     | Cook scenario bundle (release: zstd archive)                               |
| `npm run build:bundler:dev` | Cook scenario bundle (dev: verbose, skip missing assets, no zst)           |
| `npm run check`             | Oxlint + Oxfmt check                                                       |
| `npm run adventure:fmt`     | Format adventure UI (`BLACKBOX_ADVENTURE`, uses `apps/web` oxfmt config)   |
| `npm run adventure:lint`    | Oxlint adventure UI (`BLACKBOX_ADVENTURE`, uses `apps/web` oxlint config) |
| `npm run adventure:lint:react-compiler` | React Compiler ESLint on adventure UI (`BLACKBOX_ADVENTURE`) |
| `npm run adventure:check`     | All three adventure UI checks (fmt check + oxlint + react-compiler)        |
| `npm run deploy`            | Vercel production deploy from built `www/` (requires `BLACKBOX_ADVENTURE`) |
| `npm run test:wasm`         | Smoke-test wasm-bindgen ABI                                                |

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
under `data/<game-id>/src/`. Web favicons and touch icons live under `data/<game-id>/platform/web/`
and are referenced from `scenario.json` → `platforms.web.icon` (and optional `platforms.web.icons`). The game passes its notification and timing behavior to
`useBlackboxSession` through `SessionPresentationAdapter`.

Each game package includes a `tsconfig.json` extending `apps/web/tsconfig.game.json` so engine and
shared frontend dependencies resolve when editing game code in the IDE.

The engine defaults to the built-in `editor-preview` shell (`apps/web/src/shells/editor-preview/`).
It does not ship with any game's scenario content. To dev-test a project locally, set its root:

```bash
BLACKBOX_ADVENTURE=../../data/silent_archive_game npm run dev
```

Lint or format a project's custom UI (requires `src/game.ts`):

```bash
BLACKBOX_ADVENTURE=../../data/the_lesser_blood npm run adventure:fmt --prefix apps/web
npm run adventure:fmt --prefix apps/web -- --adventure=../../data/the_lesser_blood
npm run adventure:lint --prefix apps/web -- --adventure ../../data/the_lesser_blood
```

From `apps/web/`, drop `--prefix apps/web`. Paths resolve from cwd or the repo root.

Projects with a local `src/game.ts` bundle that UI; otherwise the generic shell is used. Override
only when needed with `BLACKBOX_WEB_PLAYER_GAME=<game-id>`.

Production Vercel deploy via the unified CLI:

```bash
node cli.js build --project=data/silent_archive_game --platform=web --configuration=release --deploy=vercel
```

### Web fonts

Custom UI shells declare web fonts in `src/fonts.css` (`@import url(...)` or `@font-face`). The
CSS build prepends that file so `@import` rules stay valid in the compiled bundle — do not import
it from `app.css`. New editor projects scaffold `src/fonts.css` when created or when a custom UI
shell is added. `index.html` and `preview.html` preconnect to Google Fonts; families load from
compiled `style.css`.

## Bundle layout

`blackbox-bundler` writes `<adventure>/.blackbox/build/<configuration>/web/www/bundle/project.box.meta`, a shared bundle, and one bundle per
chapter. The client loads shared content and the starting chapter first, then fetches chapter
bundles on demand. Release builds use the `.box.zst` blobs named by each bundle map; development
builds use uncompressed `.box` files.
