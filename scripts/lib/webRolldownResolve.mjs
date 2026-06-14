import { createRequire } from "node:module";
import path from "node:path";

/** npm deps bundled from apps/web when game UI lives outside the web package. */
const ENGINE_DEPS = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react-i18next",
  "i18next",
];

export function resolveEngineDepAliases(webRoot) {
  const require = createRequire(path.join(webRoot, "package.json"));
  const alias = {};
  for (const dep of ENGINE_DEPS) {
    alias[dep] = require.resolve(dep);
  }
  return alias;
}

export function createWebRolldownResolve(webRoot, { gameSrc, aliases = {} }) {
  return {
    tsconfigFilename: path.join(webRoot, "tsconfig.bundler.json"),
    alias: {
      ...resolveEngineDepAliases(webRoot),
      "@engine": path.join(webRoot, "src", "engine"),
      "@game": gameSrc,
      ...aliases,
    },
  };
}
