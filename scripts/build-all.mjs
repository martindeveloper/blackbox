#!/usr/bin/env node
// Build blackbox for all library targets supported on this host.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./lib/spawn.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const targets = [
  { script: "build-macos-aarch64.mjs", platforms: ["darwin"] },
  { script: "build-ios-aarch64.mjs", platforms: ["darwin"] },
  { script: "build-android-aarch64.mjs", platforms: ["darwin", "linux", "win32"] },
  { script: "build-web-wasm.mjs", platforms: ["darwin", "linux", "win32"] },
];

for (const { script, platforms } of targets) {
  if (!platforms.includes(process.platform)) {
    console.log(`==> skipping ${script} (not supported on ${process.platform})`);
    continue;
  }
  await run(process.execPath, [path.join(scriptsDir, script)]);
}

console.log("==> platform library builds complete under dist/");
