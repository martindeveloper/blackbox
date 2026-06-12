# blackbox-bundler-cook

Shared parser and resolver for **`bundle.cook.json`** — build-time texture/audio cook rules used by `blackbox-bundler` and `blackbox-lint`.

Runtime hosts and the engine never load this crate. Authoring assets stay as lossless sources inside each scenario folder; cook rules only affect the bundler pipeline.

## File location

Each scenario folder may include a cook sidecar:

```
data/silent_archive_game/
  scenario.json          # optional "cookRef": "bundle.cook.json"
  bundle.cook.json       # default when cookRef is omitted and this file exists
  assets.json
  ...
```

## Schema

```json
{
  "spec": "com.blackbox.bundle.cook",
  "formatVersion": 1,
  "global": {
    "texture": {
      "webpQuality": 85,
      "resize": { "maxWidth": 1920, "maxHeight": 1080 }
    }
  },
  "platforms": {
    "web": {
      "texture": { "webpQuality": 85 }
    }
  },
  "patterns": [
    {
      "match": "textures/backgrounds/**",
      "texture": {
        "resize": { "maxWidth": 1280, "maxHeight": 720 },
        "webpQuality": 80
      }
    }
  ],
  "files": {
    "textures/backgrounds/chapel.png": {
      "texture": { "resize": { "scale": 0.75 } }
    },
    "background_chapel": {
      "texture": { "resize": { "maxWidth": 960 } }
    }
  }
}
```

### Merge order (most specific wins)

1. `global`
2. `platforms.<target>` (e.g. `web`, `ios`, `android`)
3. `patterns` — longest matching glob (`textures/backgrounds/**` style only in v1)
4. `files` by asset **src path** (contains `/`)
5. `files` by asset **ref id** from `assets.json` (e.g. `background_chapel`)

Later layers override earlier ones field-by-field (`webpQuality`, each `resize` field).

### Texture fields

| Field | Type | Description |
|-------|------|-------------|
| `webpQuality` | `0..=100` | WebP quality override for this scope |
| `resize.scale` | `(0, 4]` | Multiply width and height |
| `resize.maxWidth` | `u32 > 0` | Cap width, preserve aspect |
| `resize.maxHeight` | `u32 > 0` | Cap height, preserve aspect |
| `maxWidth` + `maxHeight` | together | Fit inside box (`force_original_aspect_ratio=decrease`) |

Resolved profiles are **copy-friendly** (`TextureCookProfile`, `ResizeSpec`) with a `fingerprint()` used by the bundler cook cache.

## API

```rust
use blackbox_bundler_cook::{
    load_cook_book, read_cook_document, resolve_cook_path, validate_cook_document,
    validate_cook_file, CookBook,
};

let cook_path = resolve_cook_path(scenario_dir, &scenario_bytes);
if let Some(errors) = validate_cook_file(&cook_path, &known_srcs, &known_refs)? {
    // report errors
}
if let Some(doc) = read_cook_document(&cook_path)? {
    let book = doc.into_book("web");
    let profile = book.resolve_texture("textures/backgrounds/chapel.png", &["background_chapel"]);
}
// or: load_cook_book(&cook_path, "web")? when validation is not needed
```

## Lint integration

`blackbox-lint` calls `validate_cook_file` — no platform merge. It reports:

| Code | Meaning |
|------|---------|
| `cook-parse-failed` | Invalid JSON or unsupported `spec` |
| `unknown-cook-file-src` | `files` key is not a known asset `src` |
| `unknown-cook-file-ref` | `files` key is not a known asset id |
| `invalid-cook-resize` | Bad scale, zero dimensions, unsupported combo |
| `invalid-cook-quality` | `webpQuality` > 100 |
| `invalid-cook-pattern` | Unsupported glob (only `/**` suffix) |
| `unknown-cook-platform` | Info — typo or future platform name in `platforms` |

## Tests

```bash
cargo test -p blackbox-bundler-cook
```
