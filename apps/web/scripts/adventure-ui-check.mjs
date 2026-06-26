#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAdventureUiSrc } from "./lib/adventureDev.mjs";

const WEB_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const MODES = new Set(["fmt", "fmt:check", "lint", "lint:react-compiler", "check"]);

function bin(name) {
  const ext = process.platform === "win32" ? ".cmd" : "";
  return path.join(WEB_ROOT, "node_modules", ".bin", `${name}${ext}`);
}

function run(command, args, { cwd = WEB_ROOT } = {}) {
  execFileSync(command, args, { stdio: "inherit", cwd });
}

function resolveTarget(argv) {
  const { adventure, srcDir } = resolveAdventureUiSrc(process.env, argv);
  console.log(`==> ${adventure.gameId} (${srcDir})`);
  return srcDir;
}

function runFmt(srcDir, { check = false } = {}) {
  const args = ["-c", path.join(WEB_ROOT, ".oxfmtrc.json"), ...(check ? ["--check"] : []), srcDir];
  run(bin("oxfmt"), args);
}

function runLint(srcDir) {
  run(bin("oxlint"), ["-c", path.join(WEB_ROOT, ".oxlintrc.json"), srcDir]);
}

function runReactCompilerLint(srcDir) {
  run(bin("eslint"), ["-c", path.join(WEB_ROOT, "eslint.adventure-react-compiler.mjs"), "."], {
    cwd: srcDir,
  });
}

const mode = process.argv[2] ?? "check";
const cliArgs = process.argv.slice(3);
if (!MODES.has(mode)) {
  console.error(`Unknown mode "${mode}" — expected ${[...MODES].join(", ")}`);
  process.exit(1);
}

const srcDir = resolveTarget(cliArgs);

switch (mode) {
  case "fmt":
    runFmt(srcDir);
    break;
  case "fmt:check":
    runFmt(srcDir, { check: true });
    break;
  case "lint":
    runLint(srcDir);
    break;
  case "lint:react-compiler":
    runReactCompilerLint(srcDir);
    break;
  case "check":
    runFmt(srcDir, { check: true });
    runLint(srcDir);
    runReactCompilerLint(srcDir);
    break;
}
