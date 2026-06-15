#!/usr/bin/env node
/**
 * Stage the build CLI into resources/cli so a packaged editor can produce web, iOS, and
 * Android builds with no repository, no Rust/cargo, and no Capacitor install — only the
 * external SDKs (Xcode/CocoaPods, Android Studio) remain the user's responsibility.
 *
 * The subtree mirrors the repo layout so the relative `../../..` path math inside
 * scripts/cli/platforms/* and apps/mobile/.../workspace.mjs keeps resolving. Prebuilt WASM
 * glue is staged into .cache/wasm/clients-web so apps/web/scripts/build.mjs skips wasm-pack.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSync } from "../../../scripts/lib/spawn.mjs";

const clientRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(clientRoot, "../..");
const outDir = path.join(clientRoot, "resources", "cli");

// Paths copied verbatim (relative to repoRoot). node_modules are included because the web
// build (rolldown/tailwind/sharp) and the Capacitor CLI run from them at build time.
const COPY = [
  "cli.js",
  "scripts/cli",
  "scripts/lib",
  "scripts/package.json",
  "apps/web/package.json",
  "apps/web/rolldown.config.mjs",
  "apps/web/index.html",
  "apps/web/preview.html",
  "apps/web/vercel.json",
  "apps/web/src",
  "apps/web/scripts",
  "apps/web/assets",
  "apps/web/node_modules",
  "apps/mobile/package.json",
  "apps/mobile/native",
  "apps/mobile/src",
  "apps/mobile/scripts",
  "apps/mobile/node_modules",
];

const TSCONFIGS = [
  "tsconfig.json",
  "tsconfig.base.json",
  "tsconfig.bundler.json",
  "tsconfig.game.json",
];

function copyInto(rel) {
  const from = path.join(repoRoot, rel);
  if (!existsSync(from)) {
    console.warn(`  skip (missing): ${rel}`);
    return;
  }
  const to = path.join(outDir, rel);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true, dereference: true });
}

function ensurePrebuiltWasm() {
  const glue = path.join(repoRoot, ".cache/wasm/clients-web", "blackbox_wasm.js");
  if (existsSync(glue)) return;
  console.log("==> CLI staging: building release WASM glue (wasm-pack)…");
  runSync("npm", ["run", "build:wasm", "--prefix", path.join(repoRoot, "apps", "web")], {
    cwd: repoRoot,
    env: { ...process.env, PROFILE: "release" },
  });
}

console.log("==> CLI staging: cleaning resources/cli…");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

ensurePrebuiltWasm();

console.log("==> CLI staging: copying build subtree…");
for (const rel of COPY) copyInto(rel);
for (const name of TSCONFIGS) copyInto(`apps/web/${name}`);

// Prebuilt WASM glue: apps/web/scripts/build.mjs reads .cache/wasm/clients-web and, with
// BLACKBOX_WASM_PREBUILT_DIR pointing here, skips the wasm-pack step entirely.
console.log("==> CLI staging: copying prebuilt WASM glue…");
copyInto(".cache/wasm/clients-web");

console.log(`==> CLI staged to ${outDir}`);
