import assert from "node:assert/strict";
import test from "node:test";
import { applyDocumentPatch } from "./mcpPatch.mjs";

function snapshot() {
  return {
    bundle: {
      scenario: { spec: "com.blackbox.scenario", title: "Story", chapters: [] },
      chapters: {
        intro: {
          spec: "com.blackbox.chapter",
          id: "intro",
          title: "Intro",
          startNodeId: "start",
          nodes: {
            start: {
              id: "start",
              title: "Start",
              text: ["Keep me"],
              choices: [{ id: "go", label: "Go", goto: "hall" }],
            },
            hall: { id: "hall", title: "Hall", text: [], choices: [] },
          },
        },
      },
      items: { spec: "com.blackbox.items", items: { key: { id: "key", name: "Key" } } },
      characters: { spec: "com.blackbox.characters", characters: {} },
      assets: { spec: "com.blackbox.assets", textures: {}, music: {}, sfx: {} },
      meta: { spec: "com.blackbox.catalog", events: {}, flags: {} },
      library: null,
      filePaths: {
        scenario: "scenario.json",
        items: "items.json",
        characters: "characters.json",
        assets: "assets.json",
        meta: "catalog.json",
        library: null,
        chapters: { intro: "chapter_intro.json" },
      },
    },
  };
}

test("set_node only rewrites the touched chapter and preserves siblings", () => {
  const docs = applyDocumentPatch(snapshot(), [
    { op: "set_node", chapterId: "intro", node: { id: "vault", title: "Vault", choices: [] } },
  ]);
  assert.deepEqual(Object.keys(docs), ["chapter_intro.json"]);
  const chapter = docs["chapter_intro.json"];
  assert.deepEqual(chapter.nodes.start.text, ["Keep me"]);
  assert.equal(chapter.nodes.vault.title, "Vault");
});

test("set_choice upserts by id; append then replace", () => {
  const added = applyDocumentPatch(snapshot(), [
    {
      op: "set_choice",
      chapterId: "intro",
      nodeId: "start",
      choice: { id: "peek", label: "Peek", goto: "hall" },
    },
  ]);
  assert.deepEqual(
    added["chapter_intro.json"].nodes.start.choices.map((c) => c.id),
    ["go", "peek"],
  );

  const replaced = applyDocumentPatch(snapshot(), [
    {
      op: "set_choice",
      chapterId: "intro",
      nodeId: "start",
      choice: { id: "go", label: "Renamed", goto: "vault" },
    },
  ]);
  const choices = replaced["chapter_intro.json"].nodes.start.choices;
  assert.equal(choices.length, 1);
  assert.equal(choices[0].label, "Renamed");
});

test("remove_choice drops only the matching choice", () => {
  const docs = applyDocumentPatch(snapshot(), [
    { op: "remove_choice", chapterId: "intro", nodeId: "start", choiceId: "go" },
  ]);
  assert.deepEqual(docs["chapter_intro.json"].nodes.start.choices, []);
});

test("set_record and remove_record target the right catalog document", () => {
  const docs = applyDocumentPatch(snapshot(), [
    { op: "set_record", collection: "flag", id: "saw_light", value: { id: "saw_light" } },
    { op: "set_record", collection: "item", id: "torch", value: { id: "torch", name: "Torch" } },
    { op: "remove_record", collection: "item", id: "key" },
  ]);
  assert.deepEqual(Object.keys(docs).sort(), ["catalog.json", "items.json"]);
  assert.deepEqual(Object.keys(docs["catalog.json"].flags), ["saw_light"]);
  assert.deepEqual(Object.keys(docs["items.json"].items), ["torch"]);
});

test("multiple ops on one document accumulate into a single write", () => {
  const docs = applyDocumentPatch(snapshot(), [
    { op: "set_node", chapterId: "intro", node: { id: "vault", title: "Vault" } },
    { op: "remove_node", chapterId: "intro", nodeId: "hall" },
  ]);
  assert.deepEqual(Object.keys(docs), ["chapter_intro.json"]);
  assert.deepEqual(Object.keys(docs["chapter_intro.json"].nodes).sort(), ["start", "vault"]);
});

test("errors are coded for unknown targets and bad payloads", () => {
  assert.throws(
    () =>
      applyDocumentPatch(snapshot(), [{ op: "remove_node", chapterId: "intro", nodeId: "ghost" }]),
    /Node not found/,
  );
  assert.throws(
    () =>
      applyDocumentPatch(snapshot(), [{ op: "set_node", chapterId: "missing", node: { id: "x" } }]),
    /Unknown chapter/,
  );
  assert.throws(
    () =>
      applyDocumentPatch(snapshot(), [
        { op: "set_node", chapterId: "intro", node: { title: "no id" } },
      ]),
    /non-empty string id/,
  );
  assert.throws(
    () =>
      applyDocumentPatch(snapshot(), [
        { op: "set_record", collection: "snippet", id: "s", value: {} },
      ]),
    /create it with save_documents first/,
  );
});
