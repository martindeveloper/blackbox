#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
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

// Resolve rolldown's CLI entry so it can be launched with process.execPath (no `.bin`
// shim / PATH dependency), keeping the build on the in-package runtime on Windows MSIX.
function resolveRolldownCli() {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("rolldown/package.json");
  const bin = require(pkgPath).bin;
  const rel = typeof bin === "string" ? bin : bin.rolldown;
  return path.resolve(path.dirname(pkgPath), rel);
}

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
    runSync("npm", ["install"], { cwd: clientRoot });
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

// Run the JS/CSS/favicon steps with the current runtime (process.execPath) instead of
// `npm run …`. These steps load native addons (rolldown, @tailwindcss/oxide via
// build-game-css, sharp via build-favicon); on Windows MSIX they must run as the
// in-package executable to keep package identity, or the loader denies the addons.
runSync(process.execPath, [resolveRolldownCli(), "-c", "rolldown.config.mjs"], {
  cwd: clientRoot,
});
runSync(process.execPath, [path.join(scriptsDir, "build-game-css.mjs")], { cwd: clientRoot });
runSync(process.execPath, [path.join(scriptsDir, "build-favicon.mjs")], { cwd: clientRoot });
runSync(process.execPath, [path.join(scriptsDir, "sync-dist.mjs")]);

writeBuildInfo(dist, { crate: "blackbox-wasm", target: TARGET, profile, configuration });

console.log(`==> done (${configuration}): ${dist}`);
console.log("    start: BLACKBOX_ADVENTURE=<project> npm start --prefix apps/web");
