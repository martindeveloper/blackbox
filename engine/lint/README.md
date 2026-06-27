# blackbox-lint

Static analysis tool for Blackbox scenario bundles. It loads the manifest, chapters, item,
character, asset, story-catalog, library, and cook documents; runs the same validation the engine
uses at startup; and adds authoring-time checks for navigation, references, media, and content
hygiene.

Use it locally while writing scenarios or in CI to catch broken references before they reach the player.

## Requirements

- Rust toolchain (workspace edition 2024)
- Scenario bundles laid out like the repo defaults:

```
data/
  silent_archive_game/
    scenario.json       # scenario manifest (chapters, refs, cookRef, …)
    bundle.cook.json    # optional cook rules (see engine/bundler-cook/)
    items.json
    characters.json
    assets.json
    chapter_*.json
    music/
    sfx/
    textures/
      backgrounds/
      icons/
      characters/
    saves/            # optional runtime save files
```

Asset `src` paths in `assets.json` are resolved relative to the **scenario folder** (see `--data-root` below).

## Running

From the repository root:

```bash
# Lint every scenario in a folder (default: data)
cargo run -p blackbox-lint

# Lint a specific scenario folder or manifest
cargo run -p blackbox-lint -- data/silent_archive_game/scenario.json

# Lint a custom data directory
cargo run -p blackbox-lint -- path/to/data

# Release build (faster for repeated runs)
cargo build -p blackbox-lint --release
./.cache/target/release/blackbox-lint data
```

### Options

| Flag | Description |
|------|-------------|
| `--data-root <PATH>` | Root directory for asset `src` paths. Default: the scenario folder (`data/<name>/`). |
| `--warnings-as-errors` | Exit with code `1` if any warnings are reported (strict CI mode). |
| `--quiet` | Print only errors (suppress warnings and info). |
| `--json` | Emit one structured JSON object instead of human-readable output. |
| `--ignore <id\|category>` | Skip a rule ID or category; repeatable. |
| `--only <id\|category>` | Run only selected rule IDs or categories; repeatable. |
| `--list-rules` | Print the registered rule IDs and categories, then exit. |
| `-V`, `--version` | Print the linter version. |
| `-h`, `--help` | Show usage. |

Categories are `format`, `characters`, `catalog`, `library`, `engine`, `navigation`, `items`,
`assets`, and `references`.

```bash
cargo run -p blackbox-lint -- --only characters --only catalog data
cargo run -p blackbox-lint -- --ignore assets --ignore cook data
cargo run -p blackbox-lint -- --json data
cargo run -p blackbox-lint -- --list-rules
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Passed (no errors; warnings allowed unless `--warnings-as-errors`). |
| `1` | Lint failures (errors, or warnings with `--warnings-as-errors`). |
| `2` | Tool error (bad args, missing data root, load failure, no scenarios found). |

## Scenario discovery

When the target is a **directory**, `blackbox-lint` scans for scenario manifests. Chaptered scenarios use `scenario.json` inside each folder; legacy single-file scenarios are still discovered when they contain `startNodeId` and `nodes`.

Sidecar bundle files are skipped:

- `items.json`
- `characters.json`
- `assets.json`
- `bundle.cook.json`
- `chapter_*.json`

When the target is a **single file**, only that scenario is linted.

## Checks

Issues are reported with a severity (`error`, `warn`, `info`) and a stable **code** for filtering or CI rules.

### Syntax and bundle loading (wire phase)

Runs **before** engine load so envelope problems are reported even when content validation fails.

- Valid JSON for scenario, items, characters, assets, catalog, library, and chapter files
- Wire envelope on every bundle file:
  - Scenario: `"spec": "com.blackbox.scenario"`, `"formatVersion": 1`
  - Chapter: `"spec": "com.blackbox.chapter"`, `"formatVersion": 1`
  - Items: `"spec": "com.blackbox.items"`, `"formatVersion": 1`
  - Characters: `"spec": "com.blackbox.characters"`, `"formatVersion": 1`
  - Assets: `"spec": "com.blackbox.assets.bundle"`, `"formatVersion": 1`
  - Catalog: `"spec": "com.blackbox.catalog"`, `"formatVersion": 1`
  - Library: `"spec": "com.blackbox.library"`, `"formatVersion": 1`
- Resolvable `itemsRef` / `charactersRef` / `assetsRef` / `catalogRef` / `libraryRef` and chapter `ref` files

**Codes:** `syntax`, `wire-spec`, `format-version`

### Source analysis (source phase)

Raw JSON checks that do not require a successful engine load. Issues include file and node context.

- `modifyRelationship` and `relationshipGte` / `relationshipLte` / `relationshipEq` using metrics not declared on that character in `characters.json`
- `speaker` in text blocks that does not match any character id or name
- `characterId` in relationship effects/conditions referencing unknown characters
- Node `actors` entries referencing unknown characters
- `{relationship.<id>.<metric>}` in text with unknown character or metric
- Characters and relationship metrics declared but never used
- `setFlag` referencing a flag missing from `catalog.json` (when catalog is present)
- `@snippet` / `$snippet` referencing a snippet missing from `library.json` (when `libraryRef` is set)
- `$extends` referencing a template missing from `library.json`
- Snippet refs inside library templates pointing at undefined snippets
- Snippet/`$extends` usage when scenario has no `libraryRef`
- `{ "type": "condition", "id": "..." }` gate referencing a named condition not in `library.json`

**Codes:** `undeclared-relationship-metric`, `unknown-speaker`, `unknown-character-ref`,
`unknown-text-relationship`, `unknown-actor`, `unused-character`, `unused-relationship-metric`,
`flag-not-in-catalog`, `unknown-snippet`, `unknown-template`, `unknown-condition`,
`library-ref-missing`

Scenario **revision** for saves uses `revision` (e.g. `"3.0"`), separate from wire `formatVersion`.

### Engine validation

Reuses `blackbox::validation::validate_content` — the same rules applied when `Engine::new_game` starts:

- `startNodeId` exists and is non-empty
- Node and item keys match their `id` fields
- Duplicate choice / item-action ids
- All `goto` targets, restart targets, and skill-check branches resolve
- Choices have at least one of: effects, goto, action, or check
- Asset refs (`backgroundRef`, `iconRef`, `sfx`, `playMusic`, `playSfx`, `defaultChoiceSfx`) exist in the catalog
- Item refs in `addItem` / `removeItem` effects exist
- Gates on text and choices are pure (no `random()` / `dice()`)
- Expression compilation for dynamic values and conditions

**Codes:** `validation`, `expression`, `engine`

### Skill check balance

Warns when a skill check appears impossible or guaranteed using the stat value from
`defaultStats`, the check die `sides`, and a conservative modifier range. Boolean
terms such as `hasFlag(...)`, `hasItem(...)`, `visited(...)`, and relationship
comparisons are treated as `0..1`; unbounded numeric terms and path-dependent stat
changes are skipped.

- Impossible checks where `sides + stat + modifier` is still below `difficulty`
- Guaranteed checks where `1 + stat + modifier` already meets `difficulty`

**Codes:** `skill-check-impossible`, `skill-check-guaranteed`

### Reachability and graph structure

Forward analysis from `startNodeId` explores choice branches, skill-check outcomes, restart targets, `openLoadMenu` + `goto`, stay-on-node effects, and **item actions** (when inventory allows). Inventory is tracked optimistically along paths (gates are not evaluated).

- Nodes not reachable by any path above (death redirect targets from `deathNode` / `deathNodeId` are excluded)
- When HP can be reduced, every affected chapter must have a death redirect (chapter `deathNodeId` or scenario `deathNode` fallback)
- Chapter `deathNodeId` without scenario `deathNode` (engine validation error)
- Normal nodes that end with no choices (informational; mark `mode: game_over` or `mode: ending` if intentional)

**Codes:** `unreachable`, `missing-death-node`, `terminal-node`

### Item obtainability

Uses the same forward inventory simulation as reachability:

- Items required by `hasItem` conditions but never granted by any `addItem` on a reachable path
- Items with `addItem` effects that exist only on unreachable nodes

**Codes:** `item-unobtainable`

### Dead ends and soft locks

- `game_over` nodes with choices but no restart or load-menu action
- Nodes where **every** choice has `requires` / `when` / `unless` gates (possible soft-lock)
- Choices that loop to the same node without changing state (effects or skill-check outcomes)

**Codes:** `game-over-no-recovery`, `all-choices-gated`, `idle-loop`

### Asset files and unused assets

- Music, SFX, and texture files exist on disk under the data root
- Catalog entries never referenced in scenario content (entries with `"usage": "external"` are excluded — they are consumed outside scenario JSON, e.g. shell UI)

**Codes:** `missing-music-file`, `missing-sfx-file`, `missing-texture-file`, `unused-music`, `unused-sfx`, `unused-texture`

### Cook rules (`bundle.cook.json`)

When a scenario folder contains `bundle.cook.json` (or the path named by `cookRef` in `scenario.json`), lint loads it via [`blackbox-bundler-cook`](../bundler-cook/) and validates:

- JSON parses and `spec` is `com.blackbox.bundle.cook`
- Profile values in `global`, every `platforms` entry, `patterns`, and `files`
- `files` entries reference known asset `src` paths or catalog ids (`background_chapel`, etc.)
- `resize`, `webpQuality`, and pattern glob syntax are sane

No build target is selected — lint checks the cook document shape and references, not merged output for a platform.

**Codes:** `cook-parse-failed`, `cook-read-failed`, `unknown-cook-file-src`, `unknown-cook-file-ref`, `invalid-cook-resize`, `invalid-cook-quality`, `invalid-cook-pattern`, `unknown-cook-platform` (info)

### Reference hygiene (content phase)

- Flags checked in conditions but never set by any effect (including `roll` → `storeFlag`)
- Stats used in conditions or skill checks but missing from `defaultStats`
- Items defined in the catalog but never referenced
- `visited` / `atNode` conditions pointing at missing nodes
- `addEvent` referencing events missing from catalog; catalog events never fired
- Catalog flags never set by any `setFlag` effect

**Codes:** `flag-never-set`, `unknown-stat`, `unused-item`, `missing-visited-node`, `event-not-in-catalog`, `catalog-event-never-fired`, `catalog-flag-never-set`

### Text interpolation

Narrative `{expr}` segments in node text and item `examineText` are parsed and validated:

- Invalid expression syntax
- `{stat.*}` references missing from `defaultStats`
- `{item.*}` references missing from the item catalog
- `{flag.*}` references flags never set anywhere in content

**Codes:** `invalid-text-expr`, `unknown-text-stat`, `unknown-text-item`, `unknown-text-flag`

## Example output

Running against the bundled silent_archive scenario currently reports:

```bash
cargo run -p blackbox-lint -- data
```

```
blackbox-lint — 1 scenario(s)

== data/silent_archive_game/scenario.json == (data root: data/silent_archive_game)
[warn] all-choices-gated @ data/silent_archive_game/chapter_01_chapel.json · chapel_hatch_pressure_bleed: node 'chapel_hatch_pressure_bleed' may soft-lock: every choice has requires/when/unless gates
[warn] all-choices-gated @ data/silent_archive_game/chapter_06_director.json · director_charter_found: node 'director_charter_found' may soft-lock: every choice has requires/when/unless gates
[warn] all-choices-gated @ data/silent_archive_game/chapter_06_director.json · director_desk_search: node 'director_desk_search' may soft-lock: every choice has requires/when/unless gates
[warn] all-choices-gated @ data/silent_archive_game/chapter_06_director.json · director_dossier_read: node 'director_dossier_read' may soft-lock: every choice has requires/when/unless gates
[warn] all-choices-gated @ data/silent_archive_game/chapter_04_quiet_ward.json · grace_decides_node: node 'grace_decides_node' may soft-lock: every choice has requires/when/unless gates
[info] unused-texture: texture 'icon_data_spool' is never referenced
summary: 0 error(s), 5 warning(s), 1 info
result: passed with warnings

== total ==
summary: 0 error(s), 5 warning(s), 1 info
result: passed with warnings
```

### Strict CI example

```bash
cargo run -p blackbox-lint -- --warnings-as-errors data
```

### Errors only

```bash
cargo run -p blackbox-lint -- --quiet data
```

## CI integration

Minimal GitHub Actions step:

```yaml
- name: Lint scenarios
  run: cargo run -p blackbox-lint -- --warnings-as-errors data
```

For release pipelines, prefer a cached release binary:

```yaml
- run: cargo build -p blackbox-lint --release
- run: ./.cache/target/release/blackbox-lint --warnings-as-errors data
```

## Architecture

```
engine/lint/
  src/
    main.rs              # CLI; wire+source before load, content after load
    discover.rs          # Find scenario files in a target folder
    graph.rs             # Reachability graph from startNodeId
    refs.rs              # Collect flags, stats, items, assets used in content
    report.rs            # Severity, issue codes, formatted output
    scenario_io.rs       # Scenario folder I/O
    rules/
      mod.rs             # LintContext, lint_scenario, lint_content
      registry.rs        # Rule registry — add new rules here
      wire.rs            # Wire envelope validation
      source_bundle.rs   # Raw JSON loading and walkers
      relationships.rs   # Relationship metric checks
      characters.rs      # Speaker and character ref checks
      catalog.rs         # Catalog cross-reference checks
      library.rs         # Snippet, template, and named-condition refs
    checks/              # Content-phase check implementations
      validate.rs        # Engine validation wrapper
      reachability.rs
      items.rs
      dead_ends.rs
      death_nodes.rs
      assets.rs
      cook.rs
      references.rs
      tests.rs
```

### Extending with new rules

1. Implement `fn my_check(ctx: &LintContext<'_>, report: &mut LintReport)` in `rules/` or `checks/`.
2. Register it in `rules/registry.rs` inside `all_rules()` with the appropriate
   [`RulePhase`](src/rules/registry.rs) and a stable rule ID/category:
   - **Wire** — JSON envelopes only; no engine decode.
   - **Source** — raw JSON analysis via `source_bundle::load_source_bundle`.
   - **Content** — requires loaded `GameContent` in `ctx.content`.
3. Add a stable issue `code` string and document it in this README.
4. Add a unit test under `rules/` or `checks/tests.rs`.

The crate depends on `blackbox` (`engine/core`) for bundle decode and validation, and `blackbox-bundler-cook` for cook-rule parsing. It does **not** depend on `blackbox-bundler`. Extended checks live in `engine/lint` so the runtime engine stays lean; shared validation rules remain in `blackbox::validation`.

## Tests

```bash
cargo test -p blackbox-lint
```
