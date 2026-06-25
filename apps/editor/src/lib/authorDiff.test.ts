import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAuthorDiff, buildAuthorFileDiff, buildUndiffableFileDiff } from "./authorDiff.ts";
import type { LoadedBundle } from "./scenarioLoader.js";
import type { ProjectEvent } from "./projectApi.js";

/** Minimal LoadedBundle carrying only the fields the diff engine reads. */
function bundle(overrides: Partial<LoadedBundle> = {}): LoadedBundle {
  return {
    scenario: { title: "Story", startNodeId: "n1", chapters: ["c1"] },
    chapters: {
      c1: { title: "Chapter One", startNodeId: "n1", nodes: { n1: { title: "Start" } } },
    },
    items: { items: {} },
    characters: { characters: {} },
    assets: { music: {}, sfx: {}, textures: {} },
    meta: { events: {}, flags: {} },
    filePaths: {
      scenario: "scenario.json",
      items: "items.json",
      characters: "characters.json",
      assets: "assets.json",
      meta: "meta.json",
      chapters: { c1: "chapters/c1.json" },
    },
    ...overrides,
  } as unknown as LoadedBundle;
}

function find(changes: ReturnType<typeof buildAuthorFileDiff>["changes"], entity: string) {
  return changes.find((change) => change.entity === entity);
}

test("falls back to a raw file diff when the content is not JSON", () => {
  const diff = buildAuthorFileDiff("notes.txt", "old text", "new text");
  assert.equal(diff.sourcePath, "notes.txt");
  assert.equal(diff.changes.length, 1);
  const [change] = diff.changes;
  assert.equal(change.entity, "File");
  assert.equal(change.action, "edited");
  assert.equal(change.fields[0].kind, "code");
});

test("represents binary file reviews without raw contents", () => {
  const diff = buildUndiffableFileDiff("textures/cover.png", {
    binary: true,
    beforeSize: 1000,
    afterSize: 1200,
  });
  assert.equal(diff.sourcePath, "textures/cover.png");
  assert.equal(diff.changes.length, 1);
  assert.equal(diff.changes[0].entity, "File");
  assert.equal(diff.changes[0].fields[0].kind, "scalar");
  assert.match(diff.changes[0].fields[0].after ?? "", /Binary\/media/);
});

test("diffs scenario metadata from raw JSON without a bundle", () => {
  const before = JSON.stringify({ title: "A", startNodeId: "n1" });
  const after = JSON.stringify({ title: "B", startNodeId: "n1" });
  const diff = buildAuthorFileDiff("scenario.json", before, after);
  const change = find(diff.changes, "Project");
  assert.ok(change, "expected a scenario change");
  assert.equal(change.locator?.page, "scenario");
  const titleField = change.fields.find((field) => field.label === "Title");
  assert.deepEqual([titleField?.before, titleField?.after], ["A", "B"]);
});

test("detects an added node in a detached chapter file", () => {
  const before = JSON.stringify({ title: "Ch", nodes: { n1: { title: "Start" } } });
  const after = JSON.stringify({
    title: "Ch",
    nodes: { n1: { title: "Start" }, n2: { title: "New scene" } },
  });
  const diff = buildAuthorFileDiff("chapters/loose.json", before, after);
  const node = find(diff.changes, "Node");
  assert.ok(node, "expected a node change");
  assert.equal(node.action, "added");
  assert.equal(node.title, "New scene");
});

test("uses the bundle to render a field-level node edit", () => {
  const base = bundle();
  const before = JSON.stringify(base.chapters.c1);
  const after = JSON.stringify({
    ...base.chapters.c1,
    nodes: { n1: { title: "Renamed start" } },
  });
  const diff = buildAuthorFileDiff("chapters/c1.json", before, after, base);
  const node = find(diff.changes, "Node");
  assert.ok(node, "expected a node change");
  assert.equal(node.action, "edited");
  const title = node.fields.find((field) => field.label === "Title");
  assert.deepEqual([title?.before, title?.after], ["Start", "Renamed start"]);
  assert.equal(title?.kind, "scalar");
});

test("caps the change list at the maximum and flags truncation", () => {
  const items = Object.fromEntries(
    Array.from({ length: 200 }, (_, index) => [`i${index}`, { name: `Item ${index}` }]),
  );
  const diff = buildAuthorFileDiff("items.json", "{}", JSON.stringify({ items }), bundle());
  assert.equal(diff.changes.length, 150);
  assert.equal(diff.truncated, true);
});

test("buildAuthorDiff prefers the semantic before/after over the raw fallback", () => {
  const before = bundle();
  const after = bundle({
    items: { items: { sword: { name: "Sword" } } } as LoadedBundle["items"],
  });
  const event = {
    contribution: {
      contributor: { name: "Mara" },
      changes: [{ entity: "item", id: "sword", action: "added" }],
    },
  } as unknown as ProjectEvent;

  const diff = buildAuthorDiff(event, before, after);
  assert.match(diff.title, /Mara/);
  const item = find(diff.changes, "Item");
  assert.ok(item, "expected the semantic item change");
  assert.equal(item.action, "added");
  assert.equal(item.title, "Sword");
});

test("buildAuthorDiff falls back to reported changes without a bundle", () => {
  const event = {
    contribution: {
      contributor: { name: "Mara" },
      changes: [{ entity: "node", chapterId: "c1", id: "n2", action: "added" }],
    },
  } as unknown as ProjectEvent;

  const diff = buildAuthorDiff(event);
  assert.equal(diff.changes.length, 1);
  assert.equal(diff.changes[0].entity, "node");
});
