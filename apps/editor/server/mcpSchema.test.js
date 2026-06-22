import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  renderGrammarMarkdown,
  renderGrammarDocsMarkdown,
  SCHEMA_REFERENCE,
} from "./mcpSchema.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const grammarPath = path.join(repoRoot, "GRAMMAR.md");
const grammarDocsPath = path.join(repoRoot, "apps/homepage/content/docs/grammar.md");

test("GRAMMAR.md is in sync with SCHEMA_REFERENCE", async () => {
  const onDisk = await readFile(grammarPath, "utf8");
  assert.equal(
    onDisk,
    `${renderGrammarMarkdown()}\n`,
    "GRAMMAR.md is stale — run `node scripts/write-grammar.mjs`",
  );
});

test("docs/grammar.md is in sync with SCHEMA_REFERENCE", async () => {
  const onDisk = await readFile(grammarDocsPath, "utf8");
  assert.equal(
    onDisk,
    renderGrammarDocsMarkdown(),
    "apps/homepage/content/docs/grammar.md is stale — run `node scripts/write-grammar.mjs`",
  );
});

test("rendered grammar covers every schema entry", () => {
  const markdown = renderGrammarMarkdown();
  for (const filename of Object.keys(SCHEMA_REFERENCE.documents)) {
    assert.ok(markdown.includes(filename), `missing document ${filename}`);
  }
  for (const group of ["gates", "effects", "actions"]) {
    for (const type of Object.keys(SCHEMA_REFERENCE[group].types)) {
      assert.ok(markdown.includes(`\`${type}\``), `missing ${group} type ${type}`);
    }
  }
  // Table headers are distinct (regression: the type tables once rendered "Type | Type").
  assert.ok(markdown.includes("| Type | Shape |"));
  assert.ok(markdown.includes("| Field | Type |"));
});
