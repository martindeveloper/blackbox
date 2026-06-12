# Blackbox iOS host

Native Swift host scaffold that links the shared C ABI from `engine/ffi`. This directory contains source files to copy into **your** Xcode app — there is no `.xcodeproj` in the repo.

## Build the engine

```bash
node scripts/build-ios-aarch64.mjs
```

Produces `dist/ios-aarch64/libblackbox_ffi.a`. The C header is generated at `engine/ffi/include/blackbox.h` when you build `blackbox-ffi`.

## Xcode integration

1. Add `libblackbox_ffi.a` to **Link Binary With Libraries**.
2. Add `engine/ffi/include` to **Header Search Paths**.
3. Add `apps/ios/Blackbox/Sources/BlackboxEngine.swift` to your app target.
4. Create a bridging header that `#include "blackbox.h"`.

## Bundle content

Build a platform bundle:

```bash
cargo run -p blackbox-bundler --release -- \
  data/silent_archive_game/scenario.json \
  --platform ios -o dist/bundle-ios
```

Ship `project.box.meta`, `shared.box` + `shared.box.meta`, and the per-chapter box/map pairs. Release
builds may name `.box.zst` blobs in the maps. Parse each box's 16-byte header, load the shared
msgpack catalogs plus the required `content/chapters/<id>` entries, and pass those bytes to
`BlackboxEngine(...)`.

## API

`BlackboxEngine` wraps the current C ABI:

- `BlackboxEngine.initialize()` — call once at startup (`bb_init`)
- `init(scenario:items:characters:assets:chapters:library:randomSeedOverride:)` — msgpack content with optional library and RNG seed override
- `getCurrentView()` — revisioned JSON snapshot
- `submitCommand(_:viewRevision:)` — revision-checked JSON view delta
- `loadCatalog(_:)` / `loadLibrary(_:)`
- `loadChapter(_:)` / `unloadChapter(_:)`
- `serializeState()` / `restoreState(_:)` — JSON save and revisioned restore snapshot

Game view types should mirror `apps/web/src/types/game.ts` (`Codable`).
