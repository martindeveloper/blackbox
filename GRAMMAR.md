# Blackbox Authoring Grammar

A Blackbox game is a set of authored JSON documents. scenario.json lists chapters; each chapter file holds nodes; nodes hold text blocks and choices. Edit content with patch_documents (granular) or save_documents (whole document); add a chapter with add_chapter; then lint_project and simulate_project to validate and explore reachability.

> **Generated file — do not edit by hand.** The single source of truth is
> `apps/editor/server/mcpSchema.mjs`; regenerate with `node scripts/write-grammar.mjs`.
> The shapes mirror the canonical JSON wire format (`engine/format/src/json/wire.rs`);
> `lint_project` remains the source of truth for validation.

## Documents

### `scenario.json` — `com.blackbox.scenario`

| Field | Type |
| --- | --- |
| `formatVersion` | number (1) |
| `title` | string |
| `revision` | string, e.g. "1.0" (story version label, not the editor revision) |
| `randomSeed` | integer (optional) |
| `defaultStats` | object of stat name -> integer, e.g. { resolve: 2, insight: 2 } |
| `itemsRef` | string path, default items.json |
| `charactersRef` | string path, default characters.json |
| `assetsRef` | string path, default assets.json |
| `catalogRef` | string path to events/flags catalog, e.g. catalog.json (optional) |
| `libraryRef` | string path, default library.json |
| `cookRef` | string path, default bundle.cook.json |
| `deathNode` | inline node used as the default death screen (optional) |
| `chapters` | array of { id, title, ref } in play order |

### `chapter_<id>.json` — `com.blackbox.chapter`

| Field | Type |
| --- | --- |
| `formatVersion` | number (1) |
| `id` | string, matches the scenario chapter id |
| `title` | string |
| `startNodeId` | string, id of the node the chapter opens on |
| `nodes` | object of nodeId -> Node (see node shape) |

### `items.json` — `com.blackbox.items`

| Field | Type |
| --- | --- |
| `items` | object of itemId -> { id, name, description?, examineText?, iconRef? } |

### `characters.json` — `com.blackbox.characters`

| Field | Type |
| --- | --- |
| `characters` | object of characterId -> { id, name, subtitle?, color?, portraitRef?, voiceRef? } |

### `assets.json` — `com.blackbox.assets.bundle`

| Field | Type |
| --- | --- |
| `textures` | object of id -> texture descriptor (path under textures/) |
| `music` | object of id -> music descriptor (path under music/) |
| `sfx` | object of id -> sfx descriptor (path under sfx/) |

> Upload the binary files with upload_media before referencing them here.

### `catalog.json` — `com.blackbox.catalog`

| Field | Type |
| --- | --- |
| `events` | object of eventId -> { title, description?, internal? } (story beats) |
| `flags` | object of flagId -> { title, description?, internal? } (branchable state) |

> Referenced by scenario.catalogRef. patch_documents collections 'event' and 'flag' write here.

### `library.json` — `com.blackbox.library`

| Field | Type |
| --- | --- |
| `snippets` | object of id -> reusable text block(s); reference as "@<id>" or { "$snippet": "<id>" } |
| `templates` | object of id -> node template; reference via node "$extends" |
| `conditions` | object of name -> named gate; reference via { "type": "condition", "id": "<name>" } |

## Node

A single story beat. Key in the chapter's nodes map must equal its id.

| Field | Type |
| --- | --- |
| `id` | string |
| `title` | string |
| `mode` | "normal" (default) \| "game_over" (ends the run) \| "ending" (offers restart) |
| `onEnter` | array of Effect, applied when the node is entered |
| `backgroundRef` | string texture id (optional) |
| `text` | array of TextBlock |
| `choices` | array of Choice |
| `$extends` | string template id from library.templates (optional, advanced) |
| `$merge` | object controlling array-merge behaviour when $extends is set (advanced) |

## Text block

Either a snippet reference ("@<id>" string, or { "$snippet": "<id>", params? }) or an inline block keyed by kind.

Kinds: `paragraph`, `dialogue`, `thought`, `stage_direction`.

| Field | Type |
| --- | --- |
| `kind` | one of the kinds above |
| `text` | string |
| `speaker` | character id (for dialogue/thought) |
| `side` | "left" \| "right" \| "center" (speaker placement) |
| `when` | Gate; block only shows when the gate passes |
| `else` | string shown instead when `when` fails |
| `actor` | character id; sugar for when: { type: hasFlag, flag: _actor_<id> } |

## Choice

An option presented at a node.

| Field | Type |
| --- | --- |
| `id` | string (unique within the node) |
| `label` | string shown to the player |
| `sfx` | sfx id played on select (optional) |
| `goto` | target nodeId in the SAME chapter (omit when using action) |
| `action` | cross-chapter / menu transition instead of goto (see actions). e.g. { type: gotoChapter, chapterId, nodeId? } |
| `effects` | array of Effect applied when the choice is taken |
| `requires` | Gate; when unmet the choice is hidden, or disabled if disabledReason is set |
| `when` | Gate; the choice only appears when it passes |
| `unless` | Gate; the choice is hidden when it passes |
| `disabledReason` | string shown when `requires` is unmet (keeps the choice visible but disabled) |
| `whenDisabledReason` | string shown when `when` is unmet but you still want it visible |
| `unlessDisabledReason` | string shown when `unless` matches but you still want it visible |
| `check` | SkillCheck; resolves the choice via a dice roll (see check) |

> A choice needs exactly one resolution: goto, action, or check.

## Gates

A gate is either a single { type, ... } node or an ARRAY of nodes (array = logical AND). Most leaf gates accept an optional disabledReason.

| Type | Shape |
| --- | --- |
| `hasItem` | { type: hasItem, itemId, count?: 1, disabledReason? } |
| `hasFlag` | { type: hasFlag, flag, value?: any, disabledReason? } |
| `statGte` | { type: statGte, stat, value, disabledReason? } |
| `statLte` | { type: statLte, stat, value, disabledReason? } |
| `statEq` | { type: statEq, stat, value, disabledReason? } |
| `visited` | { type: visited, nodeId, disabledReason? } |
| `atNode` | { type: atNode, nodeId, disabledReason? } |
| `relationshipGte` | { type: relationshipGte, characterId, metric, value, disabledReason? } |
| `relationshipLte` | { type: relationshipLte, characterId, metric, value, disabledReason? } |
| `relationshipEq` | { type: relationshipEq, characterId, metric, value, disabledReason? } |
| `actorPresent` | { type: actorPresent, characterId, disabledReason? } |
| `condition` | { type: condition, id, disabledReason? } — reference a named gate in library.conditions |
| `all` | { type: all, conditions: Gate[] } |
| `any` | { type: any, conditions: Gate[] } |
| `not` | { type: not, condition: Gate } |

## Effects

Applied via node.onEnter or choice.effects. *Expr variants take a string expression.

| Type | Shape |
| --- | --- |
| `setFlag` | { type: setFlag, flag, value } or { type: setFlag, flag, valueExpr } |
| `modifyStat` | { type: modifyStat, stat, amount } or { type: modifyStat, stat, amountExpr } |
| `addItem` | { type: addItem, itemId, count?: 1 } or { ..., countExpr } |
| `removeItem` | { type: removeItem, itemId, count?: 1 } or { ..., countExpr } |
| `addEvent` | { type: addEvent, eventId } |
| `playMusic` | { type: playMusic, track } |
| `stopMusic` | { type: stopMusic } |
| `playSfx` | { type: playSfx, sfx } |
| `roll` | { type: roll, ..., storeFlag? } (advanced; stores a dice result into a flag) |
| `modifyRelationship` | { type: modifyRelationship, characterId, metric, amount } or { ..., amountExpr } |
| `setActorPresent` | { type: setActorPresent, characterId, present } |

## Actions

Used on a choice instead of goto for non-local transitions.

| Type | Shape |
| --- | --- |
| `gotoChapter` | { type: gotoChapter, chapterId, nodeId? } — nodeId defaults to that chapter's startNodeId |
| `restartGame` | { type: restartGame, startNodeId } |
| `openMainMenu` | { type: openMainMenu } |
| `openLoadMenu` | { type: openLoadMenu } |

## Skill check

A skill check on a choice. Rolls against a stat versus a difficulty.

| Field | Type |
| --- | --- |
| `stat` | string stat name |
| `difficulty` | integer target number |
| `modifier` | expression added to the roll (optional) |
| `label` | string shown during the check (optional) |
| `rollMode` | "normal" (default) \| "advantage" \| "disadvantage" |
| `maxAttempts` | integer (optional) |
| `onSuccess` | { effects?: Effect[], goto?: nodeId } |
| `onFailure` | { effects?: Effect[], goto?: nodeId } |
| `onExhausted` | { effects?: Effect[], goto?: nodeId } when maxAttempts is used (optional) |

## Conventions

- Name a new chapter file chapter_<id>.json and register it in scenario.chapters.
- Convention: the chapter's start node id is <chapterId>_start.
- Node ids are unique within a chapter; goto stays within the chapter, gotoChapter crosses chapters.
- Reachable endings use node mode "ending"; failure states use "game_over".
- Run lint_project for structural errors and simulate_project to confirm endings are reachable.
