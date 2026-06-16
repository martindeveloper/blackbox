#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveWebPlayerGame, resolveWebWwwDir } from "./lib/adventureDev.mjs";
import { buildGameCss } from "../../../scripts/lib/buildGameCss.mjs";

const WEB_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = path.resolve(WEB_ROOT, "../..");
const watch = process.argv.includes("--watch");

const { gameId, gameSrc } = resolveWebPlayerGame(process.env, WEB_ROOT, REPO_ROOT);
if (!gameSrc) {
  throw new Error(`Game UI not found for "${gameId}"`);
}

// Tailwind needs a writable scratch dir for its generated input wrapper. WEB_ROOT is
// read-only when packaged (Windows MSIX), so route it to the engine-level build cache
// (BLACKBOX_BUILD_CACHE_DIR → app data, set by the packaged editor) like the bundler does,
// falling back to WEB_ROOT/.cache in a normal writable dev checkout.
const cacheDir = path.join(
  process.env.BLACKBOX_BUILD_CACHE_DIR ?? path.join(WEB_ROOT, ".cache"),
  "preview-tailwind",
);

await buildGameCss({
  webRoot: WEB_ROOT,
  gameSrc,
  outFile: path.join(resolveWebWwwDir(process.env), "style.css"),
  cacheDir,
  watch,
});
