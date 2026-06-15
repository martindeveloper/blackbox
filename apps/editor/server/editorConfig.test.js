import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  EDITOR_SIDECAR_DIR,
  PROJECT_CONFIG_PATH,
  TOOL_RUNS_PATH,
  USER_TOOLS_PATH,
} from "../shared/blackboxPaths.js";
import { EDITOR_VERSION } from "../shared/editorVersion.js";
import { ensureProjectEditorConfig } from "./editorConfig.js";

test("creates a clean project config without storing the project path", async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-editor-config-"));
  try {
    const config = await ensureProjectEditorConfig(projectPath);
    const projectDoc = JSON.parse(
      await fs.readFile(path.join(projectPath, PROJECT_CONFIG_PATH), "utf8"),
    );
    assert.equal(projectDoc.id, config.id);
    assert.equal(projectDoc.editorVersion, EDITOR_VERSION);
    assert.equal("path" in projectDoc, false);
    await assert.rejects(fs.access(path.join(projectPath, USER_TOOLS_PATH)));
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("migrates legacy editor.json and tool-runs into the new sidecar layout", async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-editor-migrate-"));
  const sidecar = path.join(projectPath, EDITOR_SIDECAR_DIR);
  const legacyId = "legacyProj1";
  try {
    await fs.mkdir(path.join(sidecar, "tool-runs"), { recursive: true });
    await fs.writeFile(
      path.join(sidecar, "tool-runs", "latest.json"),
      `${JSON.stringify({ state: "done" }, null, 2)}\n`,
    );
    await fs.writeFile(
      path.join(sidecar, "editor.json"),
      `${JSON.stringify(
        {
          id: legacyId,
          path: "/old/absolute/path",
          editorVersion: "0.0.9",
          tools: { linter: "$workspace/tools/blackbox-lint" },
        },
        null,
        2,
      )}\n`,
    );

    const config = await ensureProjectEditorConfig(projectPath);
    assert.equal(config.id, legacyId);
    assert.equal(config.editorVersion, "0.0.9");

    const projectDoc = JSON.parse(
      await fs.readFile(path.join(projectPath, PROJECT_CONFIG_PATH), "utf8"),
    );
    assert.deepEqual(projectDoc, { id: legacyId, editorVersion: "0.0.9" });
    await assert.rejects(fs.access(path.join(sidecar, "editor.json")));

    const toolsDoc = JSON.parse(await fs.readFile(path.join(projectPath, USER_TOOLS_PATH), "utf8"));
    assert.deepEqual(toolsDoc.tools.linter, "$workspace/tools/blackbox-lint");

    await fs.access(path.join(projectPath, TOOL_RUNS_PATH));
    await assert.rejects(fs.access(path.join(sidecar, "tool-runs", "latest.json")));
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});
