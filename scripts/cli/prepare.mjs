import path from "node:path";
import { ensureTarget } from "../lib/cargo.mjs";
import { capture, commandExists, runSync } from "../lib/spawn.mjs";
import { fail, log, REPO_ROOT } from "./lib/run.mjs";

const NPM_APPS = [
  ["scripts", "build scripts"],
  ["apps/web", "web player"],
  ["apps/mobile", "mobile shell"],
  ["apps/editor", "desktop editor"],
];

const REQUIRED_TOOLS = [
  { name: "node", versionArgs: ["--version"] },
  { name: "npm", versionArgs: ["--version"] },
  { name: "rustc", versionArgs: ["--version"] },
  { name: "cargo", versionArgs: ["--version"] },
];

const OPTIONAL_TOOLS = [
  { name: "wasm-pack", versionArgs: ["--version"], hint: "cargo install wasm-pack" },
];

function toolVersion(command, versionArgs) {
  try {
    return capture(command, versionArgs).trim().split("\n")[0];
  } catch {
    return "found";
  }
}

function auditTool({ name, versionArgs, required, hint }) {
  if (!commandExists(name)) {
    const message = hint ? `${name} not found (${hint})` : `${name} not found`;
    if (required) {
      return { name, ok: false, detail: message };
    }
    log("prepare", `optional missing: ${message}`);
    return { name, ok: true, optional: true, detail: message };
  }

  const detail = toolVersion(name, versionArgs);
  log("prepare", `${required ? "ok" : "ok (optional)"} ${name}: ${detail}`);
  return { name, ok: true, detail };
}

function installNpmDependencies() {
  for (const [dir, label] of NPM_APPS) {
    const root = path.join(REPO_ROOT, dir);
    log("prepare", `npm install — ${label}`);
    runSync("npm", ["install", "--prefix", root], { cwd: REPO_ROOT });
  }
}

function installRustDependencies() {
  log("prepare", "cargo fetch");
  runSync("cargo", ["fetch"], { cwd: REPO_ROOT });

  log("prepare", "rustup target add wasm32-unknown-unknown (if needed)");
  ensureTarget("wasm32-unknown-unknown");
}

/** Bootstrap the repo for local development: install deps, then verify the toolchain. */
export function stagePrepare() {
  log("prepare", "installing dependencies");

  installNpmDependencies();

  if (!commandExists("cargo")) {
    fail("prepare", "cargo not found — install Rust from https://rustup.rs");
  }
  installRustDependencies();

  log("prepare", "checking toolchain");
  const results = [
    ...REQUIRED_TOOLS.map((tool) => auditTool({ ...tool, required: true })),
    ...OPTIONAL_TOOLS.map((tool) => auditTool({ ...tool, required: false })),
  ];

  const missingRequired = results.filter((result) => !result.ok);
  if (missingRequired.length > 0) {
    for (const result of missingRequired) {
      console.error(`[prepare] required: ${result.detail}`);
    }
    fail("prepare", "missing required development tools");
  }

  log("prepare", "ready");
}
