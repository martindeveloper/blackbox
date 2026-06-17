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
  "buildStages.mjs",
  "adventure.mjs",
  "platformAndroid.mjs",
  "platformIos.mjs",
];

const DIRS = ["preflight"];

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

for (const dir of DIRS) {
  const source = path.join(SRC, dir);
  if (!existsSync(source)) {
    throw new Error(`Missing shared lib source dir: ${source}`);
  }
  cpSync(source, path.join(OUT, dir), { recursive: true });
}

console.log(`Staged ${FILES.length} files and ${DIRS.length} dirs to ${OUT}`);
