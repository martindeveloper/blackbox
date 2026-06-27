---
title: Authoring grammar
description: JSON document layout, nodes, choices, gates, effects, and conventions for Blackbox story projects.
order: 3
---

A Blackbox game is a set of authored JSON documents. scenario.json lists chapters; each chapter file holds nodes; nodes hold text blocks and choices. Edit content with patch_documents (granular) or save_documents (whole document); add a chapter with add_chapter; then lint_project and simulate_project to validate and explore reachability.

> These shapes mirror the canonical JSON wire format. Use `lint_project` for validation
> and the [MCP server](/docs/mcp) for `patch_documents`, `save_documents`, and `add_chapter`.

## Documents

### `scenario.json` — `com.blackbox.scenario`

| Field | Type |
| --- | --- |
| `formatVersion` | number (1) |
| `title` | string |
| `revision` | string, e.g. "1.0" (story version label, not the editor revision) |
| `startNodeId` | node id for new games in single-file scenarios; omitted when using chapters |
| `nodes` | object of nodeId -> Node for single-file scenarios; omitted when using chapters |
| `randomSeed` | integer (optional) |
| `defaultStats` | object of stat name -> integer, e.g. { resolve: 2, insight: 2 } |
| `itemsRef` | string path, default items.json |
| `charactersRef` | string path, default characters.json |
| `relationshipOverrides` | object of characterId -> relationship metric overrides for new games (optional) |
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
| `deathNodeId` | node id for this chapter's death fallback; requires scenario deathNode (optional) |
| `nodes` | object of nodeId -> Node (see node shape) |

### `items.json` — `com.blackbox.items`

| Field | Type |
| --- | --- |
| `items` | object of itemId -> { id, name, description, examineText?, iconRef?, actions? } |

### `characters.json` — `com.blackbox.characters`

| Field | Type |
| --- | --- |
| `characters` | object of characterId -> { id, name, subtitle?, color?, portraitRef?, voiceRef?, relationships? } |

### `assets.json` — `com.blackbox.assets.bundle`

| Field | Type |
| --- | --- |
| `textures` | object of id -> { src, usage?: internal\|external } |
| `music` | object of id -> { src, loop?: true, usage?: internal\|external } |
| `sfx` | object of id -> { src, usage?: internal\|external } |
| `defaultChoiceSfx` | sfx id played for choices that omit sfx (optional) |

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
| `snippets` | object of id -> reusable text block(s); reference as "@<id>" or { "$snippet": "<id>", params?: { KEY: "literal text" } }; params substitute {param.KEY} placeholders |
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
| `unless` | Gate; block is hidden when the gate passes |
| `else` | string shown instead when `when` fails |
| `emotion` | host styling mood tag (optional) |
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

> A choice needs at least one resolution path: effects, goto, action, or check. Use action or check instead of normal goto; effects may accompany goto or run before a check.

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
| `roll` | { type: roll, sides?: 20, label?, storeFlag? } |
| `modifyRelationship` | { type: modifyRelationship, characterId, metric, amount } or { ..., amountExpr } |
| `setActorPresent` | { type: setActorPresent, characterId, value } |

## Item actions

Actions attached to items. They use the same gates/effects/goto semantics as choices and consume one item by default.

| Field | Type |
| --- | --- |
| `id` | string (unique within the item) |
| `label` | string shown to the player |
| `requires` | Gate; when unmet the action is hidden, or disabled if disabledReason is set |
| `when` | Gate; action only appears when it passes |
| `unless` | Gate; action is hidden when it passes |
| `disabledReason` | string shown when `requires` is unmet |
| `whenDisabledReason` | string shown when `when` is unmet but you still want it visible |
| `unlessDisabledReason` | string shown when `unless` matches but you still want it visible |
| `effects` | array of Effect applied when the item action is used |
| `goto` | target nodeId in the current chapter (optional) |
| `consume` | bool; removes one item after use when true (default true) |

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
| `sides` | integer die sides (optional, defaults to 20) |
| `modifier` | expression added to the roll (optional) |
| `label` | string shown during the check (optional) |
| `rollMode` | "normal" (default) \| "advantage" \| "disadvantage" |
| `maxAttempts` | integer (optional) |
| `onSuccess` | { effects?: Effect[], goto?: nodeId } |
| `onFailure` | { effects?: Effect[], goto?: nodeId } |
| `onExhausted` | { effects?: Effect[], goto?: nodeId } when maxAttempts is used (optional) |

## Expressions

String expressions are used by effect *Expr fields, skill-check modifier, and text interpolation.

| Form | Shape |
| --- | --- |
| `string` | "stat.logic + dice(4)" |
| `ast` | advanced JSON expression objects with lit, var, call, or op |

| Variable | Meaning |
| --- | --- |
| `stat.<name>` | number; stat value |
| `item.<itemId>` | number; inventory count |
| `flag.<name>` | bool/number/string; missing flag is false |
| `visited.<nodeId>` | bool; whether node was visited |
| `relationship.<characterId>.<metric>` | number; declared relationship score |

| Function | Meaning |
| --- | --- |
| `stat(name)` | number; stat value |
| `hasItem(id, count?)` | bool; inventory has count (default 1) |
| `itemCount(id)` | number; inventory count |
| `hasFlag(flag, value?)` | bool; flag present / equals value |
| `visited(nodeId)` | bool; node was visited |
| `relationship(characterId, metric)` | number; declared relationship score |
| `not(x)` | bool; negation |
| `random(min, max)` | number; inclusive random integer, advances RNG |
| `dice(sides)` | number; rolls one die, advances RNG |

| Operators | Meaning |
| --- | --- |
| `==, !=, eq, neq` | equality |
| `>, >=, <, <=, gt, gte, lt, lte` | comparison |
| `+, -, *, /` | arithmetic |
| `and, &&, or, ||, not, !` | boolean logic |

- Boolean results can be used as numbers in modifiers: false is 0, true is 1.
- Effect expressions and skill-check modifiers may use random() and dice(); gates and text interpolation are read-only and cannot use RNG.
- String literals may use single or double quotes.

## Conventions

- Name a new chapter file chapter_<id>.json and register it in scenario.chapters.
- Convention: the chapter's start node id is <chapterId>_start.
- Node ids are unique within a chapter; goto stays within the chapter, gotoChapter crosses chapters.
- Reachable endings use node mode "ending"; failure states use "game_over".
- Run lint_project for structural errors and simulate_project to confirm endings are reachable.
