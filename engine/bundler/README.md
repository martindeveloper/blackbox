# blackbox-bundler

Build-time compiler for Blackbox scenarios. It validates a scenario through the engine, encodes
JSON content as MessagePack, cooks media for a target platform, and writes a project bundle split
into shared and per-chapter parts.

Library crate: `blackbox_bundler`. Cook-rule parsing lives in
[`blackbox-bundler-cook`](../bundler-cook/README.md).

## Requirements

| Tool | Required? | Purpose |
|------|-----------|---------|
| Rust toolchain | yes | Build and run the bundler |
| `ffmpeg` | yes when transcoding | Audio encoding, texture resizing, and fallbacks |
| `cwebp` | optional | Preferred WebP encoder when ffmpeg lacks `libwebp` |
| Scenario folder | yes | `data/<name>/` with JSON documents and source assets |

On macOS:

```bash
brew install ffmpeg webp
```

Check the available codecs before building:

```bash
cargo run -p blackbox-bundler -- doctor --platform web
```

`doctor` supports `--platform web|ios|android`, `--ffmpeg`, and `--cwebp`. It exits `1` only when
the required ffmpeg executable is missing; unavailable optional codecs are warnings.

## Pipeline

```text
source JSON/media
  -> validate and encode JSON as MessagePack
  -> cook media for the selected platform
  -> split shared and chapter-owned entries
  -> write project map plus shared/per-chapter boxes
  -> optionally compress every box with zstd
```

Asset cooking runs on a worker pool. `--jobs 0` or an omitted `--jobs` selects the available CPU
count, capped at the asset count; `--jobs 1` is useful for sequential debugging. Results are
collected deterministically before packing.

Authoring files remain in the scenario folder. Cooked files are build artifacts cached under
`.cache/bundle/<platform>/`; raw fallback files are not cached after a failed transcode.

## Running

```bash
cargo run -p blackbox-bundler --release -- \
  data/silent_archive_game/scenario.json \
  --platform web \
  -o data/silent_archive_game/.blackbox/build/release/web/www/bundle
```

### Options

| Flag | Description |
|------|-------------|
| `--platform <TARGET>` | Required: `web`, `ios`, or `android` |
| `-o, --output <PATH>` | Output directory; default `dist/bundle` |
| `--data-root <PATH>` | Asset root; default is the scenario folder |
| `--cache-dir <PATH>` | Cook cache; default `.cache/bundle` |
| `--ffmpeg <PATH>` | ffmpeg executable; default `ffmpeg` |
| `--cwebp <PATH>` | cwebp executable; default `cwebp` |
| `--skip-transcode` | Pack source media unchanged and bypass the cook cache |
| `--ignore-missing` | Skip missing source files; intended for development |
| `--archive-compress zstd` | Write compressed shipping blobs in addition to raw boxes |
| `--jobs <N>` | Cook workers; `0` means automatic |
| `-v, --verbose` | Print content and asset transforms |
| `--json` | Emit structured command output |

## Output

For a chaptered scenario, the output directory contains:

```text
project.box.meta
shared.box
shared.box.meta
shared.box.zst                 # only with --archive-compress zstd
<chapter-id>.box
<chapter-id>.box.meta
<chapter-id>.box.zst          # only with --archive-compress zstd
...
```

`project.box.meta` uses `com.blackbox.bundle.project` and records project metadata, the shared
bundle, every chapter bundle, and chapter dependencies. Chapter bundles currently depend on
`shared`.

Each `*.box.meta` uses `com.blackbox.bundle.meta` and records its blob name, platform, scenario,
bundle ID, dependencies, optional `archiveCompression`, and entry offsets/codecs. When zstd is
enabled, the map names the `.box.zst` blob; the raw `.box` is still written.

Every box starts with a 16-byte header: `BBX\0`, a little-endian `u32` version, and eight reserved
bytes.

### Entry ownership

The shared bundle contains:

- `content/scenario`
- `content/items`
- `content/characters`
- `content/assets`
- optional `content/catalog`
- optional `content/library`
- media used by multiple chapters or otherwise assigned to shared content

Each chapter bundle contains `content/chapters/<id>` plus media assigned to that chapter. This
allows hosts to load the shared bundle and starting chapter first, then fetch later chapters on
demand.

## Inspect

Inspect a complete project output directory:

```bash
cargo run -p blackbox-bundler -- inspect data/silent_archive_game/.blackbox/build/release/web/www/bundle
```

The inspector reads `project.box.meta`, verifies every referenced shared/chapter map and blob,
checks ranges and overlaps, and compares declared codecs with byte signatures. It transparently
decompresses zstd blobs. Exit code `1` means validation failed; `2` means an I/O or parse error.

A single box/map pair can also be checked directly:

```bash
cargo run -p blackbox-bundler -- inspect \
  --map dist/bundle/shared.box.meta \
  --box dist/bundle/shared.box
```

Add `--json` for structured inspection output.

## Cook rules

An optional `bundle.cook.json` can be named by `cookRef` in `scenario.json`; otherwise the bundler
uses `bundle.cook.json` beside the manifest when present. Rules are parsed by
[`blackbox-bundler-cook`](../bundler-cook/README.md).

Merge order:

1. `global`
2. `platforms.<target>`
3. longest matching `patterns` entry
4. `files` by asset source path
5. `files` by asset reference ID

## Platform formats

With transcoding enabled, the preferred outputs are:

| Platform | Textures | Music | SFX |
|----------|----------|-------|-----|
| Web | WebP, quality 85 | Opus/OGG 96k | Opus/OGG 64k |
| iOS | WebP, quality 90 | AAC/M4A 128k | AAC/M4A 96k |
| Android | WebP, quality 80 | Opus/OGG 96k | Opus/OGG 48k |

Texture fallback order is `cwebp`, ffmpeg `libwebp`, then optimized PNG or iOS JPEG. Audio falls
back to MP3 when the preferred encoder is unavailable. If all transforms fail, the source bytes
are packed with a warning.

## Web integration

`apps/web/scripts/build-bundle.mjs` writes to `<adventure>/.blackbox/build/<configuration>/web/www/bundle`.

| npm command | Transcode | Archive | Verbose | Ignore missing |
|-------------|-----------|---------|---------|----------------|
| `npm run build:bundler` | on | zstd | off | on |
| `npm run build:bundler:dev` | on | none | on | on |
| `npm run prepare:dev` / `npm run dev` | via dev command | none | on | on |

Environment variables accepted by the script:

| Variable | Default | Effect |
|----------|---------|--------|
| `BUNDLE_PLATFORM` | `web` | Sets `--platform` |
| `BUNDLE_VERBOSE` | `0` | Adds `--verbose` when `1` |
| `BUNDLE_SKIP_TRANSCODE` | `0` | Adds `--skip-transcode` when `1` |
| `BUNDLE_IGNORE_MISSING` | `0` | Adds `--ignore-missing` when `1` |
| `BUNDLE_ARCHIVE_COMPRESS` | `none` | Adds `--archive-compress`, commonly `zstd` |

## Suggested workflow

```bash
cargo run -p blackbox-bundler -- doctor --platform web
cargo run -p blackbox-lint -- data/silent_archive_game/scenario.json
node apps/web/scripts/build-bundle.mjs --verbose --ignore-missing
node apps/web/scripts/build-bundle.mjs --ignore-missing --archive-compress zstd
cargo run -p blackbox-bundler -- inspect data/silent_archive_game/.blackbox/build/release/web/www/bundle
```

## Architecture

```text
engine/bundler-cook/     bundle.cook.json parsing and resolution
engine/bundler/src/
  main.rs                CLI and project-bundle assembly
  cook.rs                parallel cook worker pool
  media.rs               ffmpeg/cwebp transforms
  cache.rs               cook cache
  deps.rs                shared/chapter asset ownership
  format.rs              box, map, and project-map formats
  inspect.rs             structural and codec verification
  doctor.rs              external dependency checks
```

## Tests

```bash
cargo test -p blackbox-bundler
cargo test -p blackbox-bundler-cook
```
