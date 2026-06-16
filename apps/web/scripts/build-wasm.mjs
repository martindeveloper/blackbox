#!/usr/bin/env node

import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { commandExists, runSync } from "../../../scripts/lib/spawn.mjs";

const clientRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(clientRoot, "../..");
const crate = path.join(repoRoot, "engine/wasm");

function parseProfile(argv) {
  const flagIndex = argv.indexOf("--profile");
  if (flagIndex !== -1 && argv[flagIndex + 1]) {
    return argv[flagIndex + 1];
  }
  return process.env.PROFILE ?? "release";
}

const argv = process.argv.slice(2);
const profile = parseProfile(argv);
const preview = argv.includes("--preview");
const pkgDir = path.join(repoRoot, ".cache/wasm", preview ? "editor-preview" : "clients-web");

// wasm-pack's release build runs binaryen's wasm-opt as a post-step, but binaryen ships
// no arm64-windows prebuilt, so it fails on a Win ARM host. The .wasm is still optimized
// by the Rust release profile; skip only the extra wasm-opt pass on that one platform.
// TEMPORARY: drop this once binaryen publishes an arm64-windows wasm-opt build.
const skipWasmOpt = process.platform === "win32" && process.arch === "arm64";

if (!commandExists("wasm-pack")) {
  console.error("error: wasm-pack not found; install with: cargo install wasm-pack");
  process.exit(1);
}

console.log(`==> building ${preview ? "preview" : "browser"} wasm (${profile})`);
mkdirSync(pkgDir, { recursive: true });

const packFlags = ["--target", "web", "--out-dir", pkgDir, "--out-name", "blackbox_wasm"];
if (profile === "release") {
  packFlags.push("--release");
} else {
  packFlags.push("--dev");
}
if (skipWasmOpt) {
  console.log("==> skipping wasm-opt (no binaryen arm64-windows prebuilt)");
  packFlags.push("--no-opt");
}
if (preview) {
  packFlags.push("--features", "preview-json");
}

runSync("wasm-pack", ["build", crate, ...packFlags], { cwd: repoRoot });

rmSync(path.join(pkgDir, "blackbox_wasm.wasm"), { force: true });

console.log(`==> wrote ${pkgDir}/blackbox_wasm.js + blackbox_wasm_bg.wasm`);
