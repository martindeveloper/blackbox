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

await buildGameCss({
  webRoot: WEB_ROOT,
  gameSrc,
  outFile: path.join(resolveWebWwwDir(process.env), "style.css"),
  watch,
});
