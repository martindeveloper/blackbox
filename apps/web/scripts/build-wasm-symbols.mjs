#!/usr/bin/env node
// Build a DWARF-retaining wasm artifact for wasm-tools addr2line.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { commandExists, capture, runSync } from "../../../scripts/lib/spawn.mjs";
import { repoRootFrom } from "../../../scripts/lib/paths.mjs";

const repoRoot = repoRootFrom(import.meta.url, 3);
const symbolWasm = path.join(
  repoRoot,
  ".cache/target/wasm32-unknown-unknown/debug/blackbox_wasm.wasm",
);
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

if (!commandExists("wasm-tools")) {
  console.error("error: wasm-tools not found; install with: cargo install wasm-tools");
  process.exit(1);
}

console.log("==> building debug wasm cdylib (DWARF retained)");
runSync("cargo", ["build", "-p", "blackbox-wasm", "--target", "wasm32-unknown-unknown"], {
  cwd: repoRoot,
});

const headers = capture("wasm-objdump", ["-h", symbolWasm], { quiet: true });
if (!/\.debug_info/.test(headers)) {
  console.error(`error: expected .debug_info in ${symbolWasm}`);
  process.exit(1);
}

console.log(`==> DWARF present: ${symbolWasm}`);
console.log("==> symbolize offsets with:");
console.log(`    wasm-tools addr2line --code-section-relative ${symbolWasm} <offset>...`);
console.log(
  `    node ${path.join(scriptsDir, "wasm-stack.mjs")} .cache/wasm/clients-web/blackbox_wasm_bg.wasm --from-log <console.txt>`,
);
