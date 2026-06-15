# scripts/lib

Build-time helpers shared across the repo. This folder is the neutral home for
code used by **more than one** of {`apps/editor`, `apps/web`, the top-level
`scripts/*` native builders}. A helper used by only one of them lives next to its
caller instead (e.g. `apps/web/scripts/lib/adventureDev.mjs`,
`scripts/android-ndk.mjs`), not here.

The files fall into three groups:

## 1. Staged web↔editor build infra ⚠️

- `gamePaths.mjs` — resolve game-UI source dirs
- `buildGameCss.mjs` — compile a game UI's Tailwind bundle (`buildGameCss.test.mjs`)
- `webRolldownResolve.mjs` — rolldown `resolve` config for the web player
- `webBuildAliases.mjs` — stub/full module aliases (`@platform`, `@analytics`, `@preview-mode`, `@preview-reporter`)

These are special: they are consumed by the `apps/web` build **and run at runtime
by the packaged editor's on-demand preview compiler**. The packaged editor can't
reach this folder from inside its asar, so `apps/editor/scripts/stage-shared-lib.mjs`
copies these three into `apps/editor/shared/lib/` (git-ignored) at package time,
and `apps/editor/server/sharedLib.mjs` resolves them — from this folder in dev,
from the staged copy when packaged. That copy is the only reason these files
aren't imported by plain relative path everywhere. Each carries a `STAGED:` banner.

If you add a module the packaged editor needs at runtime, add it here **and** to
the `FILES` list in `stage-shared-lib.mjs`.

## 2. Generic build utilities

- `spawn.mjs` — child-process helpers
- `cargo.mjs` — Rust/cargo build helpers
- `fs-utils.mjs` — copy / build-info helpers

## 3. Native cross-compile helpers

- `build-context.mjs` — shared context for the top-level native builders
- `paths.mjs` — path constants for `build-context.mjs`

Groups 2 and 3 are build-time only — they never ship, so they need no staging.
