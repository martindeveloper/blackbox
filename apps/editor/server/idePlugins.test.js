import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { IDE_PLUGINS } from "../shared/ideRegistry.js";
import { ensureIdeProjectSettings } from "./idePlugins/index.js";

test("registered IDE plugins expose id and label", () => {
  assert.ok(IDE_PLUGINS.length > 0);
  for (const plugin of IDE_PLUGINS) {
    assert.equal(typeof plugin.id, "string");
    assert.equal(typeof plugin.label, "string");
  }
});

test("IDE plugin settings bootstrap preserves existing extension recommendations", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-ide-settings-"));
  try {
    const projectPath = path.join(root, "project");
    const typescriptLib = path.join(root, "sdk", "typescript", "lib");
    await fs.mkdir(path.join(projectPath, ".vscode"), { recursive: true });
    await fs.mkdir(typescriptLib, { recursive: true });
    await fs.writeFile(
      path.join(projectPath, ".vscode", "extensions.json"),
      `${JSON.stringify({ recommendations: ["example.existing"] }, null, 2)}\n`,
    );

    assert.equal(await ensureIdeProjectSettings(projectPath, typescriptLib), true);
    const extensions = JSON.parse(
      await fs.readFile(path.join(projectPath, ".vscode", "extensions.json"), "utf8"),
    );
    assert.deepEqual(extensions.recommendations, ["example.existing", "oxc.oxc-vscode"]);
    assert.equal(await ensureIdeProjectSettings(projectPath, typescriptLib), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
