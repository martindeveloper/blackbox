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
    await runProcess("git", ["config", "user.name", "Test Author"], root);
    await runProcess("git", ["config", "user.email", "author@example.test"], root);
    await fs.writeFile(path.join(root, "scenario.json"), "{}\n");
    const first = await provider.status(root);
    assert.equal(first.files[0]?.status, "untracked");

    const committed = await provider.execute("record", root, {
      message: "Initial story",
      paths: ["scenario.json"],
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
