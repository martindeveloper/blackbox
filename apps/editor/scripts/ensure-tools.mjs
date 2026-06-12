#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TOOLS_DIR = path.join(ROOT, "resources", "bin");
const TOOLS = ["blackbox-lint", "blackbox-bundler", "blackbox-simulator"];
const force = process.argv.includes("--force");

function toolFileName(base) {
  return process.platform === "win32" ? `${base}.exe` : base;
}

function toolPath(base) {
  return path.join(TOOLS_DIR, toolFileName(base));
}

async function toolsPresent() {
  for (const tool of TOOLS) {
    try {
      const filePath = toolPath(tool);
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) return false;
    } catch {
      return false;
    }
  }
  return true;
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

if (force || !(await toolsPresent())) {
  console.log(force ? "==> rebuilding engine tools" : "==> building engine tools");
  await runBuildTools();
}

const binaries = await verifyTools();
console.log("Engine tools ready:");
for (const binary of binaries) {
  console.log(`  ${binary}`);
}
