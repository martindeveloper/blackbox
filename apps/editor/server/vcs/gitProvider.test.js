import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GitProvider, parseGitStatus } from "./gitProvider.js";
import { runProcess } from "./process.js";

test("parses branch state and working tree files", () => {
  const status = parseGitStatus(
    [
      "# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -1",
      "1 .M N... 100644 100644 100644 abc abc scenario.json",
      "? new chapter.json",
      "",
    ].join("\0"),
  );
  assert.equal(status.workspace.label, "main");
  assert.equal(status.workspace.trackingLabel, "origin/main");
  assert.equal(status.workspace.ahead, 2);
  assert.equal(status.workspace.behind, 1);
  assert.deepEqual(status.files, [
    { path: "scenario.json", status: "modified", stateLabel: null },
    { path: "new chapter.json", status: "untracked", stateLabel: null },
  ]);
});

test("initializes, commits, reports status, and filters history", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-git-provider-"));
  const provider = new GitProvider();
  try {
    await provider.initialize(root);
    const gitignore = await fs.readFile(path.join(root, ".gitignore"), "utf8");
    assert.match(gitignore, /^\.DS_Store$/m);
    assert.match(gitignore, /^node_modules\/$/m);
    assert.match(gitignore, /^tsconfig\.json$/m);
    assert.match(gitignore, /^\.blackbox\/build\/$/m);
    assert.match(gitignore, /^\.blackbox\/cache\/$/m);
    await runProcess("git", ["config", "user.name", "Test Author"], root);
    await runProcess("git", ["config", "user.email", "author@example.test"], root);
    await fs.writeFile(path.join(root, "scenario.json"), "{}\n");
    const first = await provider.status(root);
    assert.ok(
      first.files.some((file) => file.path === "scenario.json" && file.status === "untracked"),
    );

    const committed = await provider.execute("record", root, {
      message: "Initial story",
      paths: [".gitignore", "scenario.json"],
    });
    assert.equal(committed.revision.summary, "Initial story");
    assert.equal((await provider.status(root)).files.length, 0);

    await fs.writeFile(path.join(root, "chapter.json"), "{}\n");
    await provider.execute("record", root, {
      message: "Add chapter",
      paths: ["chapter.json"],
    });
    const history = await provider.history(root, { path: "chapter.json", limit: 10 });
    assert.deepEqual(
      history.map((entry) => entry.summary),
      ["Add chapter"],
    );

    await fs.writeFile(path.join(root, "chapter.json"), '{"title":"Changed"}\n');
    const diff = await provider.diff(root, "chapter.json");
    assert.equal(diff.path, "chapter.json");
    assert.match(diff.before, /^\{\}\n$/);
    assert.match(diff.after, /Changed/);
    assert.equal(diff.status.status, "modified");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("reverts modified tracked files and removes untracked ones", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-git-revert-"));
  const provider = new GitProvider();
  try {
    await provider.initialize(root);
    await runProcess("git", ["config", "user.name", "Test Author"], root);
    await runProcess("git", ["config", "user.email", "author@example.test"], root);
    await fs.writeFile(path.join(root, "scenario.json"), "{}\n");
    await provider.execute("record", root, {
      message: "Initial story",
      paths: [".gitignore", "scenario.json"],
    });

    // Modify a tracked file and add an untracked one.
    await fs.writeFile(path.join(root, "scenario.json"), '{"title":"Edited"}\n');
    await fs.writeFile(path.join(root, "draft.json"), "{}\n");
    assert.equal((await provider.status(root)).files.length, 2);

    const result = await provider.execute("revert", root, {
      paths: ["scenario.json", "draft.json"],
    });
    assert.deepEqual(result.changedPaths.sort(), ["draft.json", "scenario.json"]);

    assert.equal((await provider.status(root)).files.length, 0);
    assert.equal(await fs.readFile(path.join(root, "scenario.json"), "utf8"), "{}\n");
    await assert.rejects(fs.access(path.join(root, "draft.json")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("detects only a repository rooted at the project folder", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-git-detection-"));
  const projectPath = path.join(root, "nested-project");
  const provider = new GitProvider();
  try {
    await provider.initialize(root);
    await fs.mkdir(projectPath);
    assert.equal(await provider.isRepository(root), true);
    assert.equal(await provider.isRepository(projectPath), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
