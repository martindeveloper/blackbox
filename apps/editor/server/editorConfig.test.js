import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PROJECT_CONFIG_PATH, USER_TOOLS_PATH } from "../shared/blackboxPaths.js";
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
