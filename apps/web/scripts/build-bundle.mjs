#!/usr/bin/env node

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSync } from "../../../scripts/lib/spawn.mjs";

const clientRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(clientRoot, "../..");
const out = path.join(clientRoot, "dist/www/bundle");
const scenario = path.join(repoRoot, "data/silent_archive_game/scenario.json");

function envFlag(name) {
  return process.env[name] === "1";
}

function parseArgs(argv) {
  const options = {
    platform: process.env.BUNDLE_PLATFORM ?? "web",
    skipTranscode: envFlag("BUNDLE_SKIP_TRANSCODE"),
    ignoreMissing: envFlag("BUNDLE_IGNORE_MISSING"),
    verbose: envFlag("BUNDLE_VERBOSE"),
    archiveCompress: process.env.BUNDLE_ARCHIVE_COMPRESS ?? "none",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--platform" && argv[i + 1]) {
      options.platform = argv[++i];
    } else if (arg === "--skip-transcode") {
      options.skipTranscode = true;
    } else if (arg === "--ignore-missing") {
      options.ignoreMissing = true;
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "--archive-compress" && argv[i + 1]) {
      options.archiveCompress = argv[++i];
    }
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));
mkdirSync(out, { recursive: true });

console.log(
  `==> building web bundle (platform=${options.platform}, output=${out}, archive=${options.archiveCompress})`,
);

const args = [
  scenario,
  "--platform",
  options.platform,
  "-o",
  out,
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
