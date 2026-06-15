#!/usr/bin/env node

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBuildConfiguration } from "../../../scripts/lib/adventure.mjs";
import { runSync } from "../../../scripts/lib/spawn.mjs";
import { resolveWebDevAdventure, resolveWebOutDir } from "./lib/adventureDev.mjs";

const clientRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(clientRoot, "../..");
// Resolved lazily (after the scenario check) so `--allow-empty` with no adventure
// stays a no-op instead of throwing on the missing adventure.
let out = null;
function outDir() {
  if (!out) out = path.join(resolveWebOutDir(process.env), "www", "bundle");
  return out;
}

function envFlag(name) {
  return process.env[name] === "1";
}

function parseArgs(argv) {
  const adventure = resolveWebDevAdventure();
  const configuration = resolveBuildConfiguration(process.env);
  const options = {
    platform: process.env.BUNDLE_PLATFORM ?? "web",
    skipTranscode: envFlag("BUNDLE_SKIP_TRANSCODE"),
    ignoreMissing: envFlag("BUNDLE_IGNORE_MISSING"),
    verbose: envFlag("BUNDLE_VERBOSE"),
    archiveCompress:
      process.env.BUNDLE_ARCHIVE_COMPRESS ??
      (configuration === "debug" ? "none" : "none"),
    scenario: adventure?.scenarioPath ?? null,
    allowEmpty: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--scenario" && argv[i + 1]) {
      options.scenario = path.resolve(argv[++i]);
    } else if (arg === "--platform" && argv[i + 1]) {
      options.platform = argv[++i];
    } else if (arg === "--skip-transcode") {
      options.skipTranscode = true;
    } else if (arg === "--ignore-missing") {
      options.ignoreMissing = true;
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "--archive-compress" && argv[i + 1]) {
      options.archiveCompress = argv[++i];
    } else if (arg === "--allow-empty") {
      options.allowEmpty = true;
    }
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));

if (!options.scenario) {
  if (options.allowEmpty) {
    console.warn("==> skipping web bundle: no BLACKBOX_ADVENTURE configured");
    process.exit(0);
  }
  throw new Error("BLACKBOX_ADVENTURE is required for a production web build");
}

if (!existsSync(options.scenario)) {
  throw new Error(`Scenario not found: ${options.scenario}`);
}

const bundleOut = outDir();
mkdirSync(bundleOut, { recursive: true });

console.log(
  `==> building web bundle (scenario=${options.scenario}, platform=${options.platform}, output=${bundleOut}, archive=${options.archiveCompress})`,
);

const args = [
  options.scenario,
  "--platform",
  options.platform,
  "-o",
  bundleOut,
  "--cache-dir",
  path.join(repoRoot, ".cache/bundle"),
];
if (options.skipTranscode) args.push("--skip-transcode");
if (options.verbose) args.push("--verbose");
if (options.ignoreMissing) args.push("--ignore-missing");
if (options.archiveCompress !== "none") {
  args.push("--archive-compress", options.archiveCompress);
}

runSync("cargo", ["run", "-p", "blackbox-bundler", "--release", "--", ...args], {
  cwd: repoRoot,
});
