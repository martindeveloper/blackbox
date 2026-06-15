// STAGED: shared with the web build and run at runtime by the packaged editor's
// preview compiler, so this file is copied into apps/editor for packaging.
// See scripts/lib/README.md and apps/editor/server/sharedLib.mjs.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

function frontendDeps(webRoot) {
  const config = JSON.parse(fs.readFileSync(path.join(webRoot, "tsconfig.game.json"), "utf8"));
  return Object.keys(config.compilerOptions.paths).filter(
    (specifier) => !specifier.startsWith("@"),
  );
}

export function resolveEngineDepAliases(webRoot, requireFrom = null) {
  const require = createRequire(requireFrom ?? path.join(webRoot, "package.json"));
  const alias = {};
  for (const dep of frontendDeps(webRoot)) {
    alias[dep] = require.resolve(dep);
  }
  return alias;
}

export function createWebRolldownResolve(webRoot, { gameSrc, aliases = {}, requireFrom = null }) {
  return {
    tsconfigFilename: path.join(webRoot, "tsconfig.bundler.json"),
    alias: {
      ...resolveEngineDepAliases(webRoot, requireFrom),
      "@engine": path.join(webRoot, "src", "engine"),
      "@game": gameSrc,
      ...aliases,
    },
  };
}
