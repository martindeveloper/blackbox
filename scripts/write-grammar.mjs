#!/usr/bin/env node
// Regenerates GRAMMAR.md and apps/homepage/content/docs/grammar.md from the single
// source of truth (apps/editor/server/mcpSchema.mjs). Run after editing SCHEMA_REFERENCE.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderGrammarDocsMarkdown,
  renderGrammarMarkdown,
} from "../apps/editor/server/mcpSchema.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  path.join(repoRoot, "GRAMMAR.md"),
  path.join(repoRoot, "apps/homepage/content/docs/grammar.md"),
];

const outputs = [`${renderGrammarMarkdown()}\n`, renderGrammarDocsMarkdown()];

for (let i = 0; i < targets.length; i++) {
  await writeFile(targets[i], outputs[i]);
  console.log(`Wrote ${targets[i]}`);
}
