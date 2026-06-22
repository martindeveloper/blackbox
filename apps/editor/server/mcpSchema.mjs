/**
 * Authoring grammar reference for Blackbox story documents, served to agents over
 * MCP so they can write valid conditions, effects, choices, and nodes without
 * reverse-engineering the DSL from existing content.
 *
 * This object is the SINGLE SOURCE OF TRUTH for the grammar. The repo-root
 * GRAMMAR.md is generated from it (`node scripts/write-grammar.mjs`) and kept in
 * sync by mcpSchema.test.js — edit the grammar here, never in GRAMMAR.md.
 *
 * The shapes mirror the canonical JSON wire format (engine/format/src/json/wire.rs);
 * lint_project remains the source of truth for validation.
 */

export const SCHEMA_REFERENCE = {
  overview:
    "A Blackbox game is a set of authored JSON documents. scenario.json lists chapters; " +
    "each chapter file holds nodes; nodes hold text blocks and choices. Edit content with " +
    "patch_documents (granular) or save_documents (whole document); add a chapter with " +
    "add_chapter; then lint_project and simulate_project to validate and explore reachability.",

  documents: {
    "scenario.json": {
      spec: "com.blackbox.scenario",
      fields: {
        formatVersion: "number (1)",
        title: "string",
        revision: 'string, e.g. "1.0" (story version label, not the editor revision)',
        randomSeed: "integer (optional)",
        defaultStats: "object of stat name -> integer, e.g. { resolve: 2, insight: 2 }",
        itemsRef: "string path, default items.json",
        charactersRef: "string path, default characters.json",
        assetsRef: "string path, default assets.json",
        catalogRef: "string path to events/flags catalog, e.g. catalog.json (optional)",
        libraryRef: "string path, default library.json",
        cookRef: "string path, default bundle.cook.json",
        deathNode: "inline node used as the default death screen (optional)",
        chapters: "array of { id, title, ref } in play order",
      },
    },
    "chapter_<id>.json": {
      spec: "com.blackbox.chapter",
      fields: {
        formatVersion: "number (1)",
        id: "string, matches the scenario chapter id",
        title: "string",
        startNodeId: "string, id of the node the chapter opens on",
        nodes: "object of nodeId -> Node (see node shape)",
      },
    },
    "items.json": {
      spec: "com.blackbox.items",
      fields: {
        items: "object of itemId -> { id, name, description?, examineText?, iconRef? }",
      },
    },
    "characters.json": {
      spec: "com.blackbox.characters",
      fields: {
        characters:
          "object of characterId -> { id, name, subtitle?, color?, portraitRef?, voiceRef? }",
      },
    },
    "assets.json": {
      spec: "com.blackbox.assets.bundle",
      fields: {
        textures: "object of id -> texture descriptor (path under textures/)",
        music: "object of id -> music descriptor (path under music/)",
        sfx: "object of id -> sfx descriptor (path under sfx/)",
      },
      note: "Upload the binary files with upload_media before referencing them here.",
    },
    "catalog.json": {
      spec: "com.blackbox.catalog",
      fields: {
        events: "object of eventId -> { title, description?, internal? } (story beats)",
        flags: "object of flagId -> { title, description?, internal? } (branchable state)",
      },
      note: "Referenced by scenario.catalogRef. patch_documents collections 'event' and 'flag' write here.",
    },
    "library.json": {
      spec: "com.blackbox.library",
      fields: {
        snippets:
          'object of id -> reusable text block(s); reference as "@<id>" or { "$snippet": "<id>" }',
        templates: 'object of id -> node template; reference via node "$extends"',
        conditions:
          'object of name -> named gate; reference via { "type": "condition", "id": "<name>" }',
      },
    },
  },

  node: {
    description: "A single story beat. Key in the chapter's nodes map must equal its id.",
    fields: {
      id: "string",
      title: "string",
      mode: '"normal" (default) | "game_over" (ends the run) | "ending" (offers restart)',
      onEnter: "array of Effect, applied when the node is entered",
      backgroundRef: "string texture id (optional)",
      text: "array of TextBlock",
      choices: "array of Choice",
      $extends: "string template id from library.templates (optional, advanced)",
      $merge: "object controlling array-merge behaviour when $extends is set (advanced)",
    },
  },

  textBlock: {
    description:
      'Either a snippet reference ("@<id>" string, or { "$snippet": "<id>", params? }) ' +
      "or an inline block keyed by kind.",
    kinds: ["paragraph", "dialogue", "thought", "stage_direction"],
    fields: {
      kind: "one of the kinds above",
      text: "string",
      speaker: "character id (for dialogue/thought)",
      side: '"left" | "right" | "center" (speaker placement)',
      when: "Gate; block only shows when the gate passes",
      else: "string shown instead when `when` fails",
      actor: "character id; sugar for when: { type: hasFlag, flag: _actor_<id> }",
    },
  },

  choice: {
    description: "An option presented at a node.",
    fields: {
      id: "string (unique within the node)",
      label: "string shown to the player",
      sfx: "sfx id played on select (optional)",
      goto: "target nodeId in the SAME chapter (omit when using action)",
      action:
        "cross-chapter / menu transition instead of goto (see actions). " +
        "e.g. { type: gotoChapter, chapterId, nodeId? }",
      effects: "array of Effect applied when the choice is taken",
      requires: "Gate; when unmet the choice is hidden, or disabled if disabledReason is set",
      when: "Gate; the choice only appears when it passes",
      unless: "Gate; the choice is hidden when it passes",
      disabledReason:
        "string shown when `requires` is unmet (keeps the choice visible but disabled)",
      whenDisabledReason: "string shown when `when` is unmet but you still want it visible",
      unlessDisabledReason: "string shown when `unless` matches but you still want it visible",
      check: "SkillCheck; resolves the choice via a dice roll (see check)",
    },
    note: "A choice needs exactly one resolution: goto, action, or check.",
  },

  gates: {
    description:
      "A gate is either a single { type, ... } node or an ARRAY of nodes (array = logical AND). " +
      "Most leaf gates accept an optional disabledReason.",
    types: {
      hasItem: "{ type: hasItem, itemId, count?: 1, disabledReason? }",
      hasFlag: "{ type: hasFlag, flag, value?: any, disabledReason? }",
      statGte: "{ type: statGte, stat, value, disabledReason? }",
      statLte: "{ type: statLte, stat, value, disabledReason? }",
      statEq: "{ type: statEq, stat, value, disabledReason? }",
      visited: "{ type: visited, nodeId, disabledReason? }",
      atNode: "{ type: atNode, nodeId, disabledReason? }",
      relationshipGte: "{ type: relationshipGte, characterId, metric, value, disabledReason? }",
      relationshipLte: "{ type: relationshipLte, characterId, metric, value, disabledReason? }",
      relationshipEq: "{ type: relationshipEq, characterId, metric, value, disabledReason? }",
      actorPresent: "{ type: actorPresent, characterId, disabledReason? }",
      condition:
        "{ type: condition, id, disabledReason? } — reference a named gate in library.conditions",
      all: "{ type: all, conditions: Gate[] }",
      any: "{ type: any, conditions: Gate[] }",
      not: "{ type: not, condition: Gate }",
    },
  },

  effects: {
    description:
      "Applied via node.onEnter or choice.effects. *Expr variants take a string expression.",
    types: {
      setFlag: "{ type: setFlag, flag, value } or { type: setFlag, flag, valueExpr }",
      modifyStat: "{ type: modifyStat, stat, amount } or { type: modifyStat, stat, amountExpr }",
      addItem: "{ type: addItem, itemId, count?: 1 } or { ..., countExpr }",
      removeItem: "{ type: removeItem, itemId, count?: 1 } or { ..., countExpr }",
      addEvent: "{ type: addEvent, eventId }",
      playMusic: "{ type: playMusic, track }",
      stopMusic: "{ type: stopMusic }",
      playSfx: "{ type: playSfx, sfx }",
      roll: "{ type: roll, ..., storeFlag? } (advanced; stores a dice result into a flag)",
      modifyRelationship:
        "{ type: modifyRelationship, characterId, metric, amount } or { ..., amountExpr }",
      setActorPresent: "{ type: setActorPresent, characterId, present }",
    },
  },

  actions: {
    description: "Used on a choice instead of goto for non-local transitions.",
    types: {
      gotoChapter:
        "{ type: gotoChapter, chapterId, nodeId? } — nodeId defaults to that chapter's startNodeId",
      restartGame: "{ type: restartGame, startNodeId }",
      openMainMenu: "{ type: openMainMenu }",
      openLoadMenu: "{ type: openLoadMenu }",
    },
  },

  check: {
    description: "A skill check on a choice. Rolls against a stat versus a difficulty.",
    fields: {
      stat: "string stat name",
      difficulty: "integer target number",
      modifier: "expression added to the roll (optional)",
      label: "string shown during the check (optional)",
      rollMode: '"normal" (default) | "advantage" | "disadvantage"',
      maxAttempts: "integer (optional)",
      onSuccess: "{ effects?: Effect[], goto?: nodeId }",
      onFailure: "{ effects?: Effect[], goto?: nodeId }",
      onExhausted: "{ effects?: Effect[], goto?: nodeId } when maxAttempts is used (optional)",
    },
  },

  conventions: {
    chapterFile: "Name a new chapter file chapter_<id>.json and register it in scenario.chapters.",
    startNode: "Convention: the chapter's start node id is <chapterId>_start.",
    nodeIds:
      "Node ids are unique within a chapter; goto stays within the chapter, gotoChapter crosses chapters.",
    endings: 'Reachable endings use node mode "ending"; failure states use "game_over".',
    validation:
      "Run lint_project for structural errors and simulate_project to confirm endings are reachable.",
  },
};

/**
 * Render SCHEMA_REFERENCE as markdown body (shared by repo GRAMMAR.md and homepage docs).
 */
function renderGrammarBody(reference, { banner } = {}) {
  const lines = [];
  const cell = (value) => String(value).replaceAll("|", "\\|");
  const blank = () => lines.push("");

  const table = (leftHeader, rightHeader, entries) => {
    lines.push(`| ${leftHeader} | ${rightHeader} |`, "| --- | --- |");
    for (const [key, value] of Object.entries(entries)) {
      lines.push(`| \`${key}\` | ${cell(value)} |`);
    }
    blank();
  };
  const section = (title, body) => {
    lines.push(`## ${title}`, "");
    if (body?.description) lines.push(body.description, "");
  };

  lines.push(reference.overview, "");
  if (banner === "repo") {
    lines.push(
      "> **Generated file — do not edit by hand.** The single source of truth is",
      "> `apps/editor/server/mcpSchema.mjs`; regenerate with `node scripts/write-grammar.mjs`.",
      "> The shapes mirror the canonical JSON wire format (`engine/format/src/json/wire.rs`);",
      "> `lint_project` remains the source of truth for validation.",
      "",
    );
  } else if (banner === "docs") {
    lines.push(
      "> These shapes mirror the canonical JSON wire format. Use `lint_project` for validation",
      "> and the [MCP server](/docs/mcp) for `patch_documents`, `save_documents`, and `add_chapter`.",
      "",
    );
  }

  lines.push("## Documents", "");
  for (const [filename, doc] of Object.entries(reference.documents)) {
    lines.push(`### \`${filename}\` — \`${doc.spec}\``, "");
    table("Field", "Type", doc.fields);
    if (doc.note) lines.push(`> ${doc.note}`, "");
  }

  section("Node", reference.node);
  table("Field", "Type", reference.node.fields);

  section("Text block", reference.textBlock);
  lines.push(`Kinds: ${reference.textBlock.kinds.map((kind) => `\`${kind}\``).join(", ")}.`, "");
  table("Field", "Type", reference.textBlock.fields);

  section("Choice", reference.choice);
  table("Field", "Type", reference.choice.fields);
  if (reference.choice.note) lines.push(`> ${reference.choice.note}`, "");

  section("Gates", reference.gates);
  table("Type", "Shape", reference.gates.types);

  section("Effects", reference.effects);
  table("Type", "Shape", reference.effects.types);

  section("Actions", reference.actions);
  table("Type", "Shape", reference.actions.types);

  section("Skill check", reference.check);
  table("Field", "Type", reference.check.fields);

  lines.push("## Conventions", "");
  for (const value of Object.values(reference.conventions)) {
    lines.push(`- ${value}`);
  }

  return lines.join("\n");
}

/**
 * Render SCHEMA_REFERENCE as the GRAMMAR.md document. This is the only place that
 * knows the markdown layout; scripts/write-grammar.mjs writes its output to disk and
 * mcpSchema.test.js asserts the on-disk file matches, so the two never drift.
 */
export function renderGrammarMarkdown(reference = SCHEMA_REFERENCE) {
  return ["# Blackbox Authoring Grammar", "", renderGrammarBody(reference, { banner: "repo" })].join(
    "\n",
  );
}

/** Render SCHEMA_REFERENCE as a homepage docs page (gray-matter frontmatter + body). */
export function renderGrammarDocsMarkdown(reference = SCHEMA_REFERENCE) {
  return `---
title: Authoring grammar
description: JSON document layout, nodes, choices, gates, effects, and conventions for Blackbox story projects.
order: 3
---

${renderGrammarBody(reference, { banner: "docs" })}
`;
}
