#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = path.resolve(ROOT, "..", "..");
const TOOLS_DIR = path.join(ROOT, "resources", "bin");
const TOOLS = ["blackbox-lint", "blackbox-bundler", "blackbox-simulator", "blackbox-scout"];
const force = process.argv.includes("--force");

// Rust sources whose changes must invalidate the staged binaries. The engine
// tree holds every tool crate and its workspace deps; the manifests cover
// dependency/version bumps.
const SOURCE_ROOTS = [path.join(REPO_ROOT, "engine")];
const SOURCE_FILES = [path.join(REPO_ROOT, "Cargo.toml"), path.join(REPO_ROOT, "Cargo.lock")];

function toolFileName(base) {
  return process.platform === "win32" ? `${base}.exe` : base;
}

function toolPath(base) {
  return path.join(TOOLS_DIR, toolFileName(base));
}

async function oldestBinaryMtime() {
  let oldest = Infinity;
  for (const tool of TOOLS) {
    try {
      const stat = await fs.stat(toolPath(tool));
      if (!stat.isFile()) return 0;
      if (stat.mtimeMs < oldest) oldest = stat.mtimeMs;
    } catch {
      return 0;
    }
  }
  return oldest === Infinity ? 0 : oldest;
}

async function newestSourceMtime() {
  let newest = 0;
  const visit = async (dir) => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "target" || entry.name === ".cache" || entry.name.startsWith(".")) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(full);
      } else if (entry.name.endsWith(".rs")) {
        const { mtimeMs } = await fs.stat(full);
        if (mtimeMs > newest) newest = mtimeMs;
      }
    }
  };
  for (const root of SOURCE_ROOTS) await visit(root);
  for (const file of SOURCE_FILES) {
    try {
      const { mtimeMs } = await fs.stat(file);
      if (mtimeMs > newest) newest = mtimeMs;
    } catch {
      // Manifest absent in this layout — ignore.
    }
  }
  return newest;
}

// Rebuild when a binary is missing or any Rust source is newer than the oldest
// staged binary. cargo itself is the source of truth for incremental work, so a
// no-op rebuild here is cheap; this just decides whether to invoke it at all.
async function toolsStale() {
  const [binMtime, srcMtime] = await Promise.all([oldestBinaryMtime(), newestSourceMtime()]);
  return binMtime === 0 || srcMtime > binMtime;
}

function runBuildTools() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["./scripts/build-tools.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("build-tools.mjs exited with code " + (code ?? 1)));
    });
  });
}

async function verifyTools() {
  const binaries = [];
  for (const tool of TOOLS) {
    const filePath = toolPath(tool);
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) throw new Error("not a file");
    } catch {
      throw new Error(`engine tool missing after build: ${toolFileName(tool)}`);
    }
    binaries.push(filePath);
  }
  return binaries;
}

if (force || (await toolsStale())) {
  console.log(
    force ? "==> rebuilding engine tools" : "==> building engine tools (sources changed)",
  );
  await runBuildTools();
}

const binaries = await verifyTools();
console.log("Engine tools ready:");
for (const binary of binaries) {
  console.log(`  ${binary}`);
}
