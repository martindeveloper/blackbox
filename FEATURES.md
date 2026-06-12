# Scenario authoring reference

This document describes every scripting and gameplay feature available in Blackbox scenario JSON. Scenarios live under `data/<name>/`. See `data/silent_archive_game/` for a full working example (manifest, chapters, items, and assets).

The engine is a **pure logic layer**: it validates content, tracks state, and returns read-only views. Hosts (web, CLI, mobile) render text, play audio, and handle save UI.

---

## Table of contents

1. [File structure](#file-structure)
2. [Top-level fields](#top-level-fields)
3. [Nodes](#nodes)
4. [Text blocks](#text-blocks)
5. [Choices](#choices)
6. [Requirements and gating](#requirements-and-gating)
7. [Effects](#effects)
8. [Skill checks](#skill-checks)
9. [Choice actions](#choice-actions)
10. [Expressions](#expressions)
11. [Audio](#audio)
12. [Runtime state](#runtime-state)
13. [Execution order](#execution-order)
14. [Saves and versioning](#saves-and-versioning)
15. [Validation rules](#validation-rules)
16. [Library: snippets and templates](#library-snippets-and-templates)
17. [What the player/host sees](#what-the-playerhost-sees)

---

## File structure

Scenarios are authored as a **folder** with a manifest, optional chapter files, and shared sidecars:

```txt
data/my_scenario/
  scenario.json          # manifest: title, revision, chapter list, sidecar refs
  items.json             # item catalog
  characters.json        # character catalog (portraits, voice, color)
  assets.json            # music, sfx, textures
  library.json           # optional reusable snippets and node templates
  chapter_01_intro.json  # chapter graph (when using chapters)
  chapter_02_tunnels.json
  saves/                 # optional runtime save files (host-specific)
```

### Manifest (`scenario.json`)

```json
{
  "spec": "com.blackbox.scenario",
  "formatVersion": 1,
  "title": "Silent Archive",
  "revision": "3.1",
  "randomSeed": 1337,
  "itemsRef": "items.json",
  "charactersRef": "characters.json",
  "relationshipOverrides": {
    "chapel_android": { "trust": 2 }
  },
  "assetsRef": "assets.json",
  "libraryRef": "library.json",
  "deathNode": {
    "title": "Signal Lost",
    "text": [{ "kind": "paragraph", "text": "Your vitals reach zero." }],
    "choices": [
      { "id": "restart", "label": "Restart.", "action": { "type": "restartGame", "startNodeId": "android_chapel_intro" } }
    ]
  },
  "chapters": [
    { "id": "chapel", "title": "The Chapel", "ref": "chapter_01_chapel.json" },
    { "id": "tunnels", "title": "Lower Service Tunnels", "ref": "chapter_02_tunnels.json" }
  ]
}
```

When `chapters` is present, node graphs live in the chapter files (not in the manifest). The inline `deathNode` is the scenario-wide fallback for vitals failure; individual chapters may override it with `deathNodeId`. The engine merges all chapters at load time. Player state (stats, inventory, flags, etc.) persists across chapter transitions.

The first chapter's `startNodeId` is where new games begin.

### Chapter file (`com.blackbox.chapter`)

```json
{
  "spec": "com.blackbox.chapter",
  "formatVersion": 1,
  "id": "chapel",
  "title": "The Chapel",
  "startNodeId": "android_chapel_intro",
  "nodes": {
    "android_chapel_intro": {
      "id": "android_chapel_intro",
      "title": "Maintenance Chapel",
      "text": [],
      "choices": []
    }
  }
}
```

Chapter `id` and `title` must match the entry in the manifest `chapters` array. Node ids must be unique across all chapters in a scenario.

| Field | Required | Description |
|-------|----------|-------------|
| `deathNodeId` | no | Overrides the scenario `deathNode` fallback when the player dies on a node in this chapter. Requires scenario `deathNode`. Must reference a `game_over` node in the same chapter file. |

### Legacy single-file scenario

For small scenarios, you may still put everything in one JSON file with `startNodeId` and `nodes` directly (no `chapters` array). Sidecar `items.json`, `characters.json`, and `assets.json` in the same folder are optional but recommended.

### Character catalog (`characters`)

```json
{
  "spec": "com.blackbox.characters",
  "formatVersion": 1,
  "characters": {
    "chapel_android": {
      "id": "chapel_android",
      "name": "Maintenance Synthetic",
      "portraitRef": "portrait_vesper",
      "voiceRef": "synthetic_flat",
      "color": "#7eb8da",
      "relationships": { "affinity": 0, "trust": 1 }
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `name` | Display name for hosts. |
| `portraitRef` | Texture id from `assets.textures` for dialogue portraits. |
| `voiceRef` | Optional voice/style id for hosts (not played by the engine). |
| `color` | Optional hex color for nameplates and UI chrome. |
| `relationships` | Optional map of relationship metric names to starting values for new games. Declares which metrics exist for this character (e.g. `trust`, `submission`). |

Use character ids as `speaker` on `dialogue` / `thought` lines. Hosts resolve `name`, `portrait`, `voiceRef`, and `color` from `GameView.characters`.

```json
{
  "spec": "com.blackbox.scenario",
  "formatVersion": 1,
  "title": "My Scenario",
  "startNodeId": "intro",
  "revision": "1.0",
  "randomSeed": 1337,
  "defaultStats": { "hp": 10, "logic": 3 },
  "nodes": {
    "intro": {
      "id": "intro",
      "title": "Chapter One",
      "text": [],
      "onEnter": [],
      "choices": []
    }
  }
}
```

**Naming rules**

- Every key in `nodes` must match that node's `id`.
- Node ids, choice ids, item ids, flag names, and audio track ids are plain strings you define.
- All `goto` targets, restart targets, and `startNodeId` must reference existing node ids.

---

## Top-level fields

| Field | Required | Description |
|-------|----------|-------------|
| `spec` | yes | Must be `"com.blackbox.scenario"`. |
| `formatVersion` | yes | Must be `1`. |
| `title` | no | Human-readable scenario name for hosts (menus, headers). |
| `startNodeId` | yes* | Node id where new games begin. *Omitted when using `chapters` — first chapter's `startNodeId` is used. |
| `nodes` | yes* | Map of node id → node object. *Omitted when using `chapters`. |
| `chapters` | no | Ordered list of `{ "id", "title", "ref" }` pointing to chapter JSON files. Mutually exclusive with top-level `nodes`. |
| `itemsRef` | no | Path to item catalog JSON (default: `items.json`). |
| `charactersRef` | no | Path to character catalog JSON (default: `characters.json`). |
| `relationshipOverrides` | no | Per-scenario starting values that override character `relationships`. Keys must be metrics already declared on that character. Merged at load time. |
| `assetsRef` | no | Path to asset catalog JSON (default: `assets.json`). |
| `revision` | no | Scenario revision string, stored in saves. Mismatched saves are rejected on restore. |
| `randomSeed` | no | Seed for deterministic RNG. Defaults to a built-in constant if omitted. |
| `defaultStats` | no | Starting player stats for new games and restarts. Defaults to `hp`, `max_hp`, `empathy`, `logic`, `violence` (see below). |
| `deathNode` | no | Inline node shown when `hp` reaches `0` and no chapter override applies. Same fields as a normal node except `id` (the engine assigns `"__death__"`). Defaults to `mode: "game_over"`. Chapters may override with `deathNodeId` (see chapter files). |

**Default stats** (when `defaultStats` is omitted):

| Stat | Default |
|------|---------|
| `hp` | 10 |
| `max_hp` | 10 |
| `empathy` | 3 |
| `logic` | 3 |
| `violence` | 1 |

You may define any additional stat names in `defaultStats`. Stats are integers; negative values are clamped to `0` after each command. When `deathNode` is set and `hp` reaches `0`, the engine automatically navigates to the synthetic `__death__` node (after choice/item resolution and `onEnter` effects). Chapter files may override this fallback with their own `deathNodeId`. Without any configured death node, the player can remain at `0` HP until scenario content routes them elsewhere.

---

## Nodes

Each node is a story beat: narrative text plus choices.

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Must equal the key in `nodes`. |
| `title` | no | Location/room title shown by hosts (distinct from scenario/chapter titles). |
| `mode` | no | `"normal"` (default) or `"game_over"`. Game-over nodes signal endings to hosts. |
| `text` | no | Array of [text blocks](#text-blocks). Defaults to empty. |
| `onEnter` | no | [Effects](#effects) run when the player **arrives** at this node. Not re-run on save restore. |
| `choices` | no | Array of [choices](#choices). May be empty (dead end / ending). |

**Visited tracking:** The current node is marked visited after every successful command. Use `visited('node_id')` or the `visited` requirement to branch on prior visits.

---

## Text blocks

Narrative content is an ordered list of text blocks. Blocks are **resolved at view time**: conditional lines are filtered, then `{expressions}` in text are interpolated.

| Field | Required | Description |
|-------|----------|-------------|
| `kind` | yes | Line type for host styling (see [kinds](#text-kinds)). |
| `text` | yes | Body copy. Supports [interpolation](#text-interpolation). |
| `when` | no | Structured [gate](#gates). Block is omitted when false. |
| `unless` | no | Structured [gate](#gates). Block is omitted when true. |
| `speaker` | no | Character id or display name (dialogue / thought). |
| `emotion` | no | Mood tag for host styling, e.g. `cold`, `urgent`. |
| `side` | no | Dialogue placement: `"left"`, `"right"`, or `"center"`. |

### Text kinds

| `kind` | Typical use |
|--------|-------------|
| `paragraph` | Third-person narration. |
| `dialogue` | Spoken line; use with `speaker`, optional `emotion` and `side`. |
| `thought` | Internal monologue; often paired with `speaker: "YOU"`. |
| `stage_direction` | Short system/meta lines (vitals, inventory notes, scene notes). |

Hosts may style any `kind`; these names are conventions the web client understands.

### Text interpolation

Embed live values with `{expression}`:

```json
{
  "kind": "stage_direction",
  "text": "Vitals: {stat.hp}/{stat.max_hp} HP. Cards: {item.burned_access_card}."
}
```

- Expressions use the same language as `when` and `requires`.
- Interpolation is **read-only** — `random()` and `dice()` cannot be used inside `{...}`.
- Escape literal braces: `{{` → `{`, `}}` → `}`.

**Shorthand variables** (inside `{...}` or expressions):

| Variable | Meaning |
|----------|---------|
| `stat.<name>` | Player stat value (missing stat → `0`). |
| `item.<itemId>` | Inventory count (missing item → `0`). |
| `flag.<name>` | Flag value (missing flag → `false`). |
| `visited.<nodeId>` | Whether the player has visited that node. |

### Conditional text

```json
{
  "kind": "thought",
  "speaker": "YOU",
  "text": "The burned card might still work.",
  "when": { "type": "hasItem", "itemId": "burned_access_card", "count": 1 }
}
```

```json
{
  "kind": "dialogue",
  "speaker": "CHECKPOINT AI",
  "text": "\"Present credentials.\"",
  "unless": { "type": "hasItem", "itemId": "burned_access_card", "count": 1 }
}
```

Gates are **structured JSON only** (no string scripts). A block is shown when `when` passes (or is absent) and `unless` fails (or is absent).

**If/else text** — add `"else"` to avoid duplicating mirrored lines:

```json
{
  "kind": "thought",
  "text": "The reflection includes the lullaby fragment.",
  "else": "The reflection is incomplete — something is missing.",
  "when": { "type": "hasItem", "itemId": "lullaby_fragment", "count": 1 }
}
```

When the gate fails, the engine shows `else` instead of skipping the block. When it passes, it shows `text`. Omit `else` to keep the old skip-on-fail behavior.

---

## Choices

Choices are flat objects (presentation, gate, and resolution fields merged at the top level):

```json
{
  "id": "open_door",
  "label": "Open the door.",
  "requires": [{ "type": "hasItem", "itemId": "key", "count": 1 }],
  "disabledReason": "You need a key.",
  "whenDisabledReason": "You are not ready for this yet.",
  "unlessDisabledReason": "This option no longer applies.",
  "effects": [{ "type": "removeItem", "itemId": "key", "count": 1 }],
  "goto": "hallway"
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique within the node. Used by hosts to submit `{ "type": "choose", "choice_id": "..." }`. |
| `label` | Player-facing button text. |
| `requires` | [Gate](#gates) — choice is shown as **disabled** (with lock) when this fails. Supports `any` / `all` / `not` combinators, not just flat AND arrays. |
| `when` | Optional structured [gate](#gates). Choice is **hidden** from view when this fails, unless `whenDisabledReason` is set (see below). |
| `unless` | Optional structured [gate](#gates). Choice is **hidden** from view when this passes, unless `unlessDisabledReason` is set. |
| `disabledReason` | Fallback shown when `requires` fails; also used for lone `when`/`unless` gates when the specific reason fields are omitted. |
| `whenDisabledReason` | When set, a failing `when` gate shows the choice **disabled** with this message instead of hiding it. |
| `unlessDisabledReason` | When set, a passing `unless` gate shows the choice **disabled** with this message instead of hiding it. |
| `effects` | [Effects](#effects) applied when selected (before skill check / navigation). |
| `goto` | Target node id after effects (and skill check, if any). |
| `check` | Optional [skill check](#skill-checks). Replaces normal `goto` resolution. |
| `action` | Optional [choice action](#choice-actions) (`restartGame`, `openLoadMenu`, `gotoChapter`). |
| `sfx` | SFX id from `audio.sfx`; falls back to `defaultChoiceSfx`. |

**Choice must do something:** Each choice needs at least one of: `effects`, `goto`, `action`, or `check`.

**Disabled choices** (`requires` not met) remain visible in the view with `enabled: false` and a `disabledReason`. Submitting a disabled choice returns an error.

**Hidden choices** (`when` failing or `unless` passing) are omitted from the view entirely — identical to how text blocks use `when`/`unless`. Use this for one-shot or contextual choices that should disappear once used or inapplicable. Use `requires` (not `when`/`unless`) when you want the player to see the option exists but cannot take it yet.

**Continue shortcut:** Hosts may send `{ "type": "continue" }`. The engine selects the choice with `id: "continue"`, or the first choice if none is named `continue`.

---

## Gates

Visibility (`when` / `unless` on text blocks and choices) uses **declarative JSON gates** — not string scripts.

A gate passes when:

- `when` is absent or evaluates true, **and**
- `unless` is absent or evaluates false.

### Gate shapes

**Single condition**

```json
{ "type": "hasItem", "itemId": "burned_access_card", "count": 1 }
```

**Array (AND)** — every entry must pass

```json
"when": [
  { "type": "hasFlag", "flag": "asked_android_about_prayer" },
  { "type": "statGte", "stat": "empathy", "value": 2 }
]
```

**Combinators**

```json
{
  "type": "any",
  "conditions": [
    { "type": "statGte", "stat": "logic", "value": 10 },
    { "type": "hasFlag", "flag": "trusted" }
  ]
}
```

```json
{
  "type": "not",
  "condition": { "type": "hasItem", "itemId": "key", "count": 1 }
}
```

```json
{
  "type": "all",
  "conditions": [
    { "type": "visited", "nodeId": "intro" },
    { "type": "statGte", "stat": "hp", "value": 1 }
  ]
}
```

**`unless` (negation sugar)** — prefer this over `not` for simple cases

```json
"unless": { "type": "hasItem", "itemId": "burned_access_card", "count": 1 }
```

Equivalent to hiding the line when the player has the card.

---

## Conditions

`requires` on choices and item actions uses the full [gate](#gates) algebra — not just flat AND lists.

**Flat AND** (array shorthand — every entry must pass):

```json
"requires": [
  { "type": "hasItem", "itemId": "burned_access_card", "count": 1 },
  { "type": "statGte", "stat": "logic", "value": 3 }
]
```

**OR / NOT** — same combinators as `when` / `unless`:

```json
"requires": {
  "type": "any",
  "conditions": [
    { "type": "hasFlag", "flag": "ari_released" },
    { "type": "hasFlag", "flag": "grace_chose" }
  ]
}
```

**Per-condition disabled reasons** — tell the player which gate failed:

```json
"requires": [
  {
    "type": "hasItem",
    "itemId": "facility_override_key",
    "count": 1,
    "disabledReason": "You need the facility override key."
  },
  {
    "type": "statGte",
    "stat": "empathy",
    "value": 3,
    "disabledReason": "You need more empathy to choose to remain."
  }
]
```

The first failing leaf condition wins; its `disabledReason` is shown, then the choice-level `disabledReason` fallback, then an auto-generated message.

| `type` | Fields | Meaning |
|--------|--------|---------|
| `hasItem` | `itemId`, `count` (default `1`) | Inventory has at least `count`. |
| `hasFlag` | `flag`, `value` (optional) | Flag exists; if `value` given, must match. |
| `statGte` | `stat`, `value` | Stat ≥ value. |
| `statLte` | `stat`, `value` | Stat ≤ value. |
| `statEq` | `stat`, `value` | Stat = value. |
| `visited` | `nodeId` | Player has visited node. |
| `relationshipGte` | `characterId`, `metric`, `value` | Character metric ≥ value. |
| `relationshipLte` | `characterId`, `metric`, `value` | Character metric ≤ value. |
| `relationshipEq` | `characterId`, `metric`, `value` | Character metric = value. |

`metric` is `affinity` or `trust`.

Use `when` / `unless` with combinators for nested logic. `requires` accepts the same gate shapes.

**`requires` vs `when` vs `unless`:** All three use the gate algebra. `requires` failures show the choice disabled. `when`/`unless` failures hide the choice unless a `whenDisabledReason` / `unlessDisabledReason` is set (then disabled with that message). All are evaluated without mutating state and cannot use RNG.

---

## Effects

Effects mutate state. They appear in:

- `node.onEnter`
- `choice.effects`
- `skillCheck.onSuccess.effects` / `onFailure.effects`

Apply in array order.

### `setFlag`

```json
{ "type": "setFlag", "flag": "met_guard", "value": true }
{ "type": "setFlag", "flag": "score", "valueExpr": "stat.logic + 2" }
```

| Field | Description |
|-------|-------------|
| `flag` | Flag name. |
| `value` | Literal: boolean, integer, or string. |
| `valueExpr` | Expression evaluated to bool, number, or string. |

Provide `value` **or** `valueExpr`, not both.

### `modifyStat`

```json
{ "type": "modifyStat", "stat": "hp", "amount": -2 }
{ "type": "modifyStat", "stat": "hp", "amountExpr": "0 - dice(6)" }
```

Adds `amount` (or `amountExpr` result) to the stat. Stats floor at `0` after the command.

### `addItem` / `removeItem`

```json
{ "type": "addItem", "itemId": "burned_access_card", "count": 1 }
{ "type": "removeItem", "itemId": "burned_access_card", "count": 1 }
{ "type": "addItem", "itemId": "credits", "countExpr": "random(1, 10)" }
```

`count` defaults to `1` when omitted. `removeItem` saturates at zero and removes the entry when count hits `0`.

### `addEvent`

```json
{ "type": "addEvent", "event": "You take 2 damage from static." }
{ "type": "addEvent", "eventExpr": "\"HP now \" + stat.hp" }
```

Appends a line to the persistent **event log** (shown in `GameView.events`). The log is never cleared by the engine.

### `playMusic`

```json
{ "type": "playMusic", "track": "main" }
```

Sets ambient music to the catalog track id. Persists across nodes until `stopMusic` or another `playMusic`.

### `stopMusic`

```json
{ "type": "stopMusic" }
```

Clears ambient music.

### `playSfx`

```json
{ "type": "playSfx", "sfx": "pulse_static" }
```

Plays a one-shot SFX cue from the catalog. Hosts receive it as `CommandResult.triggered_sfx` after the command that applied the effect (typically node `onEnter`).

### `roll`

```json
{ "type": "roll", "sides": 20, "label": "Luck", "storeFlag": "last_roll" }
```

Rolls one die (default 20 sides), records it in `CommandResult.rolls`, and optionally stores the result in a numeric flag.

### `modifyRelationship`

```json
{ "type": "modifyRelationship", "characterId": "chapel_android", "metric": "trust", "amount": 1 }
{ "type": "modifyRelationship", "characterId": "chapel_android", "metric": "affinity", "amountExpr": "0 - 2" }
```

| Field | Description |
|-------|-------------|
| `characterId` | Character id from the catalog. |
| `metric` | `affinity` or `trust`. |
| `amount` / `amountExpr` | Delta applied to the metric (negative values allowed). |

Provide `amount` **or** `amountExpr`, not both.

---

## Skill checks

When a choice has `check`, the normal `goto` is ignored. Resolution uses the check outcome instead.

```json
{
  "id": "hack_panel",
  "label": "Hack the panel.",
  "check": {
    "stat": "logic",
    "difficulty": 12,
    "label": "Panel hack",
    "modifier": 0,
    "onSuccess": {
      "effects": [{ "type": "addEvent", "event": "Access granted." }],
      "goto": "inside"
    },
    "onFailure": {
      "effects": [{ "type": "addEvent", "event": "Alarm triggered." }],
      "goto": "caught"
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `stat` | Stat name added as bonus to the d20 roll. |
| `difficulty` | Target number (DC). Success when `d20 + modifier >= difficulty`. |
| `label` | Roll label in `CommandResult.rolls` (defaults to `"<stat> check"`). |
| `modifier` | Optional extra modifier expression (may use RNG). |
| `onSuccess` / `onFailure` | Branch with `effects` and/or `goto`. Each branch must have at least one. |

**Resolution:** `total = d20 + stat_value + modifier`. Recorded as a `skillCheck` roll in command results.

**Order:** Choice `effects` run first, then the skill check roll and branch effects, then navigation.

---

## Choice actions

Special behaviors bound to choices:

### `restartGame`

```json
{
  "id": "play_again",
  "label": "Play again.",
  "action": { "type": "restartGame", "startNodeId": "intro" }
}
```

Resets all state (stats, inventory, flags, events, visited, RNG counter) and jumps to `startNodeId`. `onEnter` on that node runs. `randomSeed` is reset from content.

### `openLoadMenu`

```json
{
  "id": "load",
  "label": "Load game.",
  "action": { "type": "openLoadMenu" }
}
```

Signals the host to open its load UI. The engine does not load a save by itself. If `goto` is also set, navigation still occurs after the choice resolves.

### `gotoChapter`

```json
{
  "id": "enter_hatch",
  "label": "Enter the maintenance hatch.",
  "action": {
    "type": "gotoChapter",
    "chapterId": "tunnels",
    "nodeId": "lower_service_tunnels"
  }
}
```

Moves the player into another chapter. Player state is preserved (stats, inventory, flags, events, visited nodes, ambient music, RNG).

- `chapterId` — must match a chapter listed in the manifest.
- `nodeId` — optional. Defaults to that chapter's `startNodeId`. When set, the node must belong to the target chapter.

Hosts receive `chapter_changed: true` on the command result and should use it for transition UI. The view also includes `scenario_title`, `chapter_id`, and `chapter_title`.

---

## Expressions

String expressions are for **computed values only** — effect `*Expr` fields, skill-check `modifier`, and text `{interpolation}`. Branching gates (`requires`, `when`, `unless`) use [structured conditions](#conditions) and [gates](#gates), not string scripts.

### Input forms

1. **String** — `"stat.logic + dice(4)"` (in `*Expr` and `{...}` interpolation)
2. **AST** — JSON objects with `lit`, `var`, `call`, or `op` (advanced)

### Variables

| Form | Type | Notes |
|------|------|-------|
| `stat.<name>` | number | Shorthand for `stat("name")`. |
| `item.<itemId>` | number | Shorthand for `itemCount("itemId")`. |
| `flag.<name>` | bool/number/string | Missing flag → `false`. |
| `visited.<nodeId>` | bool | Shorthand for `visited("nodeId")`. |
| `relationship.<characterId>.<metric>` | number | Score for a metric declared on that character. |

### Functions

| Function | Args | Pure? | Description |
|----------|------|-------|-------------|
| `stat(name)` | string | yes | Stat value. |
| `hasItem(id, count?)` | string, number? | yes | Inventory check (count defaults to 1). |
| `itemCount(id)` | string | yes | Item count. |
| `hasFlag(flag, value?)` | string, any? | yes | Flag present / equals value. |
| `visited(nodeId)` | string | yes | Node visited. |
| `relationship(characterId, metric)` | string, string | yes | Score for a declared relationship metric. |
| `not(x)` | any | yes | Boolean negation. |
| `random(min, max)` | number, number | **no** | Inclusive random integer; advances RNG. |
| `dice(sides)` | number | **no** | Roll one die; advances RNG. |

**Purity rule:** Gates cannot use RNG. Effect expressions and skill-check modifiers may use `random()` / `dice()`.

### Operators

| Operators | Meaning |
|-----------|---------|
| `==`, `!=`, `eq`, `neq` | Equality |
| `>`, `>=`, `<`, `<=`, `gt`, `gte`, `lt`, `lte` | Comparison |
| `+`, `-`, `*`, `/` | Arithmetic |
| `and`, `&&`, `or`, `\|\|`, `not`, `!` | Boolean logic |

String literals use single or double quotes: `'burned_access_card'`.

### Expression AST (advanced)

```json
{
  "call": "hasItem",
  "args": [
    { "lit": "key" },
    { "lit": 1 }
  ]
}
```

```json
{
  "op": "gte",
  "left": { "var": "stat.logic" },
  "right": { "lit": 3 }
}
```

---

## Audio

```json
"audio": {
  "defaultChoiceSfx": "click",
  "music": {
    "main": { "src": "music/theme.mp3", "loop": true },
    "tension": { "src": "music/tension.mp3", "loop": true }
  },
  "sfx": {
    "click": { "src": "sfx/click.wav" }
  }
}
```

| Field | Description |
|-------|-------------|
| `music.<id>.src` | Path relative to the scenario folder. |
| `music.<id>.loop` | Loop ambient track (default `true`). |
| `sfx.<id>.src` | Path relative to the scenario folder. |
| `defaultChoiceSfx` | SFX id played when a choice is selected unless the choice sets `sfx`. |

Music is driven by `playMusic` / `stopMusic` effects and exposed as `GameView.music`. Choice SFX is metadata on choices; `playSfx` effects fire one-shot cues on `onEnter` and in choice/item effects. Hosts play `CommandResult.selected_sfx` (choice click) and `CommandResult.triggered_sfx` (effect-driven) after submission. The engine never plays audio itself.

---

## Runtime state

State the engine tracks (authors read/write via effects and expressions):

| State | Access | Notes |
|-------|--------|-------|
| **Stats** | `modifyStat`, `stat.*`, `stat()` | Integer map; custom names allowed. |
| **Inventory** | `addItem`, `removeItem`, `item.*`, `hasItem`, `itemCount` | Item id → count. |
| **Flags** | `setFlag`, `flag.*`, `hasFlag` | Bool, number, or string values. |
| **Events** | `addEvent` | Append-only string log. |
| **Visited nodes** | automatic, `visited()` | Updated after each command. |
| **Ambient music** | `playMusic`, `stopMusic` | Track id or cleared. |
| **RNG** | `randomSeed`, `random()` / `dice()` / `roll` | Deterministic; seed + counter saved. |
| **Relationships** | `modifyRelationship`, `relationship.*` | Per-character named metrics declared in `characters.json` (`relationships`), with optional scenario overrides. |
| **Current node** | `goto`, `check` branches | `GameView.node_id`. |

---

## Execution order

When the player selects a choice:

1. **Validate** — choice exists and is enabled.
2. **Choice effects** — `choice.effects` in order.
3. **Skill check** (if present) — roll, then `onSuccess` or `onFailure` effects.
4. **Navigate** — `goto` from choice, check branch, or `restartGame` action.
5. **`onEnter`** — if the node changed, run destination `onEnter` effects in order.
6. **Normalize** — clamp stats to ≥ 0.
7. **Mark visited** — current node added to visited set.
8. **Build view** — filter/interpolate text blocks, evaluate choice gates, return `GameView`.

`onEnter` does **not** run when restoring a save; saved `ambient_music` is used as-is.

---

## Saves and versioning

- On-disk example saves live under `data/<scenario>/saves/` (e.g. `data/silent_archive_game/saves/checkpoint.json`).
- Hosts call `serialize_state` / `restore_state` (Wasm) or equivalent Rust API.
- Saves store: current node, stats, inventory, flags, relationships, events, visited nodes, ambient music, RNG seed/counter, and `revision`.
- Saves missing `relationships` (legacy) backfill from merged character defaults on restore.
- If the scenario `revision` field changes between save and content, restore fails with `revisionMismatch`.
- Changing scenario text or graph does not auto-invalidate saves unless you bump `revision`.

---

## Validation rules

Content is validated at load time. Common failures:

| Rule | Error |
|------|-------|
| `startNodeId` missing or unknown | validation error |
| Node key ≠ `id` | validation error |
| Duplicate choice id in one node | validation error |
| `goto` / check branch / restart target unknown | validation error |
| `gotoChapter` references unknown chapter or node | validation error |
| Duplicate node id across chapters | validation error |
| Scenario defines both `chapters` and `nodes` | validation error |
| Choice with no effects, goto, action, or check | validation error |
| Skill-check branch with no effects and no goto | validation error |
| `playMusic` track or `sfx` id not in catalog | validation error |
| `defaultChoiceSfx` missing from catalog | validation error |
| Effect with both literal and `*Expr` field | validation error |
| Effect missing required literal or `*Expr` | validation error |
| Impure expression in `requires`, choice `when`, or text `when` | validation error |
| Invalid expression syntax | validation error |
| Chapter `deathNodeId` without scenario `deathNode` | validation error |
| `$extends` references unknown template | validation error |
| `@snippet` references unknown snippet | validation error |

---

## Library: snippets and templates

Reusable content lives in an optional **`library.json`** sidecar referenced from the manifest via `libraryRef`. The engine resolves library content at load time (before validation and compilation).

### Library file (`com.blackbox.library`)

```json
{
  "spec": "com.blackbox.library",
  "formatVersion": 1,
  "snippets": {
    "hud_vitals": {
      "kind": "stage_direction",
      "text": "HP: {stat.hp}/{stat.max_hp}."
    }
  },
  "templates": {
    "game_over_standard": {
      "title": "Signal Lost",
      "mode": "game_over",
      "onEnter": [{ "type": "stopMusic" }],
      "text": ["@hud_vitals"],
      "choices": [
        {
          "id": "restart",
          "label": "Restart.",
          "action": { "type": "restartGame", "startNodeId": "intro" }
        }
      ]
    }
  }
}
```

| Section | Description |
|---------|-------------|
| `snippets` | Named text blocks you can insert into any node `text` array. |
| `templates` | Partial node definitions (same shape as inline `deathNode`) used with `$extends`. |

### Snippet references in `text[]`

Insert a snippet by id in a node's `text` array:

```json
"text": [
  "@hud_vitals",
  { "kind": "paragraph", "text": "The corridor continues." }
]
```

Alternate object form:

```json
{ "$snippet": "hud_vitals" }
```

Snippet ids must start with a letter or underscore and contain only letters, digits, and underscores.

### Node inheritance with `$extends`

Nodes can inherit from a library template and overlay only the fields that differ:

```json
"tunnels_game_over": {
  "id": "tunnels_game_over",
  "$extends": "game_over_standard",
  "text": [
    {
      "kind": "paragraph",
      "text": "The tunnels swallow the last of your signal."
    }
  ],
  "choices": [
    {
      "id": "restart",
      "label": "Restart from the tunnels.",
      "action": { "type": "restartGame", "startNodeId": "lower_service_tunnels" }
    }
  ]
}
```

Merge rules:

| Field | Behavior |
|-------|----------|
| `title`, `backgroundRef` | Overlay value wins when set; otherwise inherit from template. |
| `mode` | Overlay wins when set; otherwise inherit from template. |
| `text`, `onEnter`, `choices` | Non-empty overlay replaces the template field entirely; empty overlay inherits. |

The node `id` always comes from the chapter file, never from the template.

---

## What the player/host sees

Each command returns a `GameView` (JSON from Wasm hosts):

| Field | Description |
|-------|-------------|
| `scenario_title` | Scenario title from manifest (if set). |
| `chapter_id`, `chapter_title` | Active chapter (when scenario uses chapters). |
| `node_id`, `title`, `mode` | Current node. |
| `text` | Resolved text blocks (interpolated, filtered). |
| `choices` | `id`, `label`, `enabled`, `disabledReason`, optional `check` preview, `action`, `sfx`. |
| `music` | Active ambient track cue, if any. |
| `background` | Active background texture cue, if any. |
| `inventory_items` | Inventory with display names and icons. |
| `characters` | Character catalog entries with live relationship scores, portrait cue, voice, and color. |
| `player_stats` | Full stat map. |
| `inventory` | Item id → count. |
| `flags` | All flags. |
| `events` | Full event log. |

`CommandResult` also includes `rolls` (all RNG and skill checks from that command), `selected_sfx`, `triggered_sfx`, and `chapter_changed` (true when the active chapter changed during that command).

---

## Quick reference: minimal branching node

```json
{
  "id": "fork",
  "title": "The Fork",
  "text": [
    { "kind": "paragraph", "text": "The corridor splits." },
    {
      "kind": "dialogue",
      "speaker": "RADIO",
      "emotion": "static",
      "side": "center",
      "text": "\"{stat.hp} HP remaining. Choose wisely.\""
    }
  ],
  "choices": [
    {
      "id": "left",
      "label": "Go left.",
      "goto": "left_path"
    },
    {
      "id": "right",
      "label": "Go right.",
      "requires": [{ "type": "statGte", "stat": "logic", "value": 3 }],
      "disabledReason": "You are not clever enough.",
      "goto": "right_path"
    }
  ]
}
```

---

## Not supported (yet)

These are intentionally outside scenario JSON today:

- Hidden choices (disabled choices are still shown)
- `goto` as an effect (navigation is via choice `goto` or check branches only)
- Combat or quests
- Localization string tables

Chaptered scenarios **are** supported via the manifest + chapter file layout described in [File structure](#file-structure).

For engine and host setup, see [README.md](README.md).
