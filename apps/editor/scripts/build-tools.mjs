#!/usr/bin/env node

import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCargoTargetDir } from "../../../scripts/lib/cargo.mjs";
import { runSync } from "../../../scripts/lib/spawn.mjs";

const clientRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(clientRoot, "../..");
const outDir = path.join(clientRoot, "resources/bin");
const targetDir = resolveCargoTargetDir(repoRoot);
const tools = [
  "blackbox-lint",
  "blackbox-bundler",
  "blackbox-convert",
  "blackbox-simulator",
  "blackbox-scout",
];

mkdirSync(outDir, { recursive: true });

console.log("==> building editor engine tools (release)");
runSync(
  "cargo",
  [
    "build",
    "--release",
    "-p",
    "blackbox-lint",
    "-p",
    "blackbox-bundler",
    "-p",
    "blackbox-convert",
    "-p",
    "blackbox-simulator",
    "-p",
    "blackbox-scout",
  ],
  { cwd: repoRoot, env: { ...process.env, CARGO_TARGET_DIR: targetDir } },
);

function resolveSource(tool) {
  const unix = path.join(targetDir, "release", tool);
  if (existsSync(unix)) {
    return unix;
  }
  const windows = path.join(targetDir, "release", `${tool}.exe`);
  if (existsSync(windows)) {
    return windows;
  }
  return null;
}

function resolveDestName(tool, source) {
  return source.endsWith(".exe") ? `${tool}.exe` : tool;
}

for (const tool of tools) {
  const source = resolveSource(tool);
  if (!source) {
    console.error(`error: ${tool} binary not found under ${path.join(targetDir, "release")}`);
    process.exit(1);
  }
  const destName = resolveDestName(tool, source);
  const dest = path.join(outDir, destName);
  copyFileSync(source, dest);
  if (process.platform !== "win32") {
    chmodSync(dest, 0o755);
  }
  console.log(`  ${destName}`);
}

console.log(`==> tools installed to ${outDir}`);
