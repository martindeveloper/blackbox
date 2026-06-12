# blackbox-ffi

Stable C ABI for native mobile hosts.

| Host | Artifact |
|------|----------|
| iOS (`apps/ios`) | `libblackbox_ffi.a` |
| Android (`apps/android`) | `libblackbox_ffi.so` |

The web client uses wasm-bindgen instead (`engine/wasm` → `.cache/wasm/clients-web/`).

## Build

```bash
cargo build -p blackbox-ffi --release
```

Cross-compile for mobile:

```bash
node scripts/build-ios-aarch64.mjs
node scripts/build-android-aarch64.mjs
```

## C header

`include/blackbox.h` is generated on build (`cbindgen`).

## Contract

- **Create:** msgpack scenario/items/characters/assets/chapters, optional library bytes, and an optional RNG seed override (`bb_engine_new`)
- **Stream content:** load catalog/library/chapter bytes and unload chapters (`bb_load_*`, `bb_unload_chapter`)
- **Play:** revisioned JSON snapshots and command deltas (`bb_get_view`, `bb_submit`)
- **Save:** JSON state; restore returns a new revisioned snapshot (`bb_serialize`, `bb_restore`)
- **Memory:** caller allocates with `bb_alloc`, frees with `bb_free`
- **Output sizing:** a negative return value means the output buffer is too small; retry with its absolute value
- **Errors:** failed calls return `0`; details are consumed via `bb_last_error`

The native ABI matches the `BlackboxEngine` WASM surface. `bb_submit` requires the revision from the
last `bb_get_view`/successful command/restore response and rejects stale revisions without mutating
engine state.

Reference hosts: `apps/ios/Blackbox/Sources/BlackboxEngine.swift` and
`apps/android/blackbox/src/main/kotlin/com/blackbox/engine/BlackboxEngine.kt`.
