import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EDITOR_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = path.resolve(EDITOR_ROOT, "../..");
const SRC = path.join(REPO_ROOT, "scripts", "lib");
const OUT = path.join(EDITOR_ROOT, "shared", "lib");

const FILES = [
  "gamePaths.mjs",
  "buildGameCss.mjs",
  "webRolldownResolve.mjs",
  "webBuildAliases.mjs",
  "spawn.mjs",
];

if (!existsSync(SRC)) {
  throw new Error(`Missing repo scripts/lib at ${SRC}`);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const file of FILES) {
  const source = path.join(SRC, file);
  if (!existsSync(source)) {
    throw new Error(`Missing shared lib source: ${source}`);
  }
  cpSync(source, path.join(OUT, file));
}

console.log(`Staged ${FILES.length} shared lib modules to ${OUT}`);
