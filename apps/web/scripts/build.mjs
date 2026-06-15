#!/usr/bin/env node

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeBuildInfo } from "../../../scripts/lib/fs-utils.mjs";
import { run, runSync } from "../../../scripts/lib/spawn.mjs";
import { resolveWebOutDir } from "./lib/adventureDev.mjs";

const clientRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(resolveWebOutDir(process.env), "www");
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

const TARGET = "wasm32-unknown-unknown";
const profile = process.env.PROFILE ?? "release";

if (!existsSync(path.join(clientRoot, "node_modules"))) {
  console.log("==> installing npm dependencies");
  runSync("npm", ["install", "--prefix", clientRoot]);
}

await run(process.execPath, [path.join(scriptsDir, "build-wasm.mjs"), "--profile", profile], {
  env: { ...process.env, PROFILE: profile },
});

console.log("==> bundling TypeScript with Rolldown and CSS with Tailwind v4");
mkdirSync(dist, { recursive: true });
runSync(process.execPath, [
  path.join(scriptsDir, "build-bundle.mjs"),
  "--ignore-missing",
  "--archive-compress",
  "zstd",
]);
runSync("npm", ["run", "build:js", "--prefix", clientRoot]);
runSync("npm", ["run", "build:css", "--prefix", clientRoot]);
runSync("npm", ["run", "build:favicon", "--prefix", clientRoot]);
runSync(process.execPath, [path.join(scriptsDir, "sync-dist.mjs")]);

writeBuildInfo(dist, { crate: "blackbox-wasm", target: TARGET, profile });

console.log(`==> done: ${dist}`);
console.log("    start: npm start --prefix apps/web");
