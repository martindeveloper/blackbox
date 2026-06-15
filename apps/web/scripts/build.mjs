#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveBuildConfiguration,
  wasmProfileForConfiguration,
} from "../../../scripts/lib/adventure.mjs";
import { writeBuildInfo } from "../../../scripts/lib/fs-utils.mjs";
import { run, runSync } from "../../../scripts/lib/spawn.mjs";
import { resolveWebWwwDir } from "./lib/adventureDev.mjs";

const clientRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const configuration = resolveBuildConfiguration(process.env);
const dist = resolveWebWwwDir(process.env);
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

const TARGET = "wasm32-unknown-unknown";
const profile = process.env.PROFILE ?? wasmProfileForConfiguration(configuration);

// Generated WASM glue files consumed by sync-dist.mjs and the runtime player.
const WASM_GLUE = [
  "blackbox_wasm.js",
  "blackbox_wasm_bg.wasm",
  "blackbox_wasm.d.ts",
  "blackbox_wasm_bg.wasm.d.ts",
];

const repoRoot = path.resolve(clientRoot, "../..");
const wasmCacheDir = path.join(repoRoot, ".cache/wasm/clients-web");

// A self-contained editor ships prebuilt WASM so the player build needs no Rust/wasm-pack.
// BLACKBOX_WASM_PREBUILT_DIR points at the vendored glue (optionally under a <profile>/ subdir).
function syncPrebuiltWasm(prebuiltDir) {
  const source = existsSync(path.join(prebuiltDir, profile))
    ? path.join(prebuiltDir, profile)
    : prebuiltDir;
  if (path.resolve(source) === path.resolve(wasmCacheDir)) return; // already in place
  mkdirSync(wasmCacheDir, { recursive: true });
  for (const name of WASM_GLUE) {
    const from = path.join(source, name);
    if (existsSync(from)) copyFileSync(from, path.join(wasmCacheDir, name));
  }
}

const prebuiltWasmDir = process.env.BLACKBOX_WASM_PREBUILT_DIR;
if (prebuiltWasmDir) {
  console.log(`==> using prebuilt WASM (${profile}) from ${prebuiltWasmDir}`);
  // If the glue is already staged in the cache dir (read-only packaged resources),
  // a copy is unnecessary and may fail — tolerate that and reuse what's present.
  try {
    syncPrebuiltWasm(prebuiltWasmDir);
  } catch (error) {
    if (!existsSync(path.join(wasmCacheDir, "blackbox_wasm.js"))) throw error;
    console.log(`==> reusing staged WASM in ${wasmCacheDir} (${error.code ?? "copy skipped"})`);
  }
} else {
  if (!existsSync(path.join(clientRoot, "node_modules"))) {
    console.log("==> installing npm dependencies");
    runSync("npm", ["install", "--prefix", clientRoot]);
  }

  await run(process.execPath, [path.join(scriptsDir, "build-wasm.mjs"), "--profile", profile], {
    env: { ...process.env, PROFILE: profile },
  });
}

console.log(`==> bundling TypeScript with Rolldown and CSS with Tailwind v4 (${configuration})`);
mkdirSync(dist, { recursive: true });

const bundleArgs =
  configuration === "debug"
    ? [path.join(scriptsDir, "build-bundle.mjs"), "--verbose", "--ignore-missing"]
    : [path.join(scriptsDir, "build-bundle.mjs"), "--ignore-missing", "--archive-compress", "zstd"];
runSync(process.execPath, bundleArgs);

runSync("npm", ["run", "build:js", "--prefix", clientRoot]);
runSync("npm", ["run", "build:css", "--prefix", clientRoot]);
runSync("npm", ["run", "build:favicon", "--prefix", clientRoot]);
runSync(process.execPath, [path.join(scriptsDir, "sync-dist.mjs")]);

writeBuildInfo(dist, { crate: "blackbox-wasm", target: TARGET, profile, configuration });

console.log(`==> done (${configuration}): ${dist}`);
console.log("    start: BLACKBOX_ADVENTURE=<project> npm start --prefix apps/web");
