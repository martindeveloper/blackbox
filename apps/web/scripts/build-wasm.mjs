#!/usr/bin/env node

import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { commandExists, runSync } from "../../../scripts/lib/spawn.mjs";

const clientRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(clientRoot, "../..");
const pkgDir = path.join(repoRoot, ".cache/wasm/clients-web");
const crate = path.join(repoRoot, "engine/wasm");

function parseProfile(argv) {
  const flagIndex = argv.indexOf("--profile");
  if (flagIndex !== -1 && argv[flagIndex + 1]) {
    return argv[flagIndex + 1];
  }
  return process.env.PROFILE ?? "release";
}

const profile = parseProfile(process.argv.slice(2));

if (!commandExists("wasm-pack")) {
  console.error("error: wasm-pack not found; install with: cargo install wasm-pack");
  process.exit(1);
}

console.log(`==> building browser wasm (wasm-bindgen, ${profile})`);
mkdirSync(pkgDir, { recursive: true });

const packFlags = ["--target", "web", "--out-dir", pkgDir, "--out-name", "blackbox_wasm"];
if (profile === "release") {
  packFlags.push("--release");
}

runSync("wasm-pack", ["build", crate, ...packFlags], { cwd: repoRoot });

rmSync(path.join(pkgDir, "blackbox_wasm.wasm"), { force: true });

console.log(`==> wrote ${pkgDir}/blackbox_wasm.js + blackbox_wasm_bg.wasm`);
