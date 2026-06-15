#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? 1}`));
    });
  });
}

const skipTools = process.argv.includes("--skip-tools");

await run("npm", ["run", "build"]);

if (skipTools) {
  console.warn("Skipping engine tool build (--skip-tools)");
} else {
  await run("node", ["./scripts/ensure-tools.mjs", "--force"]);
}

// Stage the web player workspace into resources/ so on-demand preview builds work
// in the packaged app (electron-builder copies it via extraResources).
await run("node", ["./players/registry.mjs", "stageForPackaging"]);
await run("node", ["./scripts/stage-shared-lib.mjs"]);

console.log("Electron build inputs are ready. Run: npm run electron:dist");
