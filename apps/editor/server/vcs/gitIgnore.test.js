import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { collectGitIgnoreEntries, ensureGitIgnore } from "./gitIgnore.js";

test("ensureGitIgnore writes base entries for new projects", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-gitignore-"));
  try {
    assert.equal(await ensureGitIgnore(root), true);
    const gitignore = await fs.readFile(path.join(root, ".gitignore"), "utf8");
    assert.match(gitignore, /^\.DS_Store$/m);
    assert.match(gitignore, /^Thumbs\.db$/m);
    assert.match(gitignore, /^node_modules\/$/m);
    assert.match(gitignore, /^tsconfig\.json$/m);
    assert.match(gitignore, /^\.blackbox\/build\/$/m);
    assert.match(gitignore, /^\.blackbox\/cache\/$/m);
    assert.equal(await ensureGitIgnore(root), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("ensureGitIgnore appends missing entries without duplicating", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-gitignore-"));
  try {
    await fs.writeFile(path.join(root, ".gitignore"), ".DS_Store\ntmp/\n");
    assert.equal(await ensureGitIgnore(root), true);
    const gitignore = await fs.readFile(path.join(root, ".gitignore"), "utf8");
    assert.equal(gitignore.split("node_modules/").length, 2);
    assert.equal(gitignore.split(".DS_Store").length, 2);
    assert.equal(await ensureGitIgnore(root), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("collectGitIgnoreEntries includes IDE plugin entries", () => {
  const entries = collectGitIgnoreEntries();
  assert.ok(entries.includes(".vscode/settings.json"));
  assert.ok(entries.includes(".blackbox/user/"));
  assert.ok(entries.includes(".blackbox/build/"));
  assert.ok(entries.includes(".blackbox/cache/"));
});
