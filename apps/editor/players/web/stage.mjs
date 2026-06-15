import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  devEngineRoot,
  EDITOR_ROOT,
  PROTOCOL_PATH,
  REPO_ROOT,
  STAGED_WORKSPACE_DIR,
} from "./manifest.mjs";

// Stage a self-contained workspace the packaged editor builds previews FROM:
// web engine sources + rolldown/tailwind toolchain + a curated node_modules.
const WEB_ROOT = devEngineRoot();
const SRC_NM = path.join(WEB_ROOT, "node_modules");
const OUT = STAGED_WORKSPACE_DIR;
// electron-builder strips top-level node_modules from extraResources; nest under pkg/.
const OUT_PKG = path.join(OUT, "pkg");
const OUT_NM = path.join(OUT_PKG, "node_modules");

const ROOTS = [
  "rolldown",
  "@tailwindcss/cli",
  "@tailwindcss/node",
  "@tailwindcss/oxide",
  "react",
  "react-dom",
  "i18next",
  "react-i18next",
  "fzstd",
  "typescript",
  // Type-only deps: not needed to build a preview, but they let a developer's IDE
  // resolve React types against the bundled SDK without a monorepo or npm install.
  "@types/react",
  "@types/react-dom",
];

const NATIVE_GLOBS = [
  ["@rolldown", /^binding-/],
  ["@tailwindcss", /^oxide-/],
];

function pkgDir(name) {
  const dir = path.join(SRC_NM, name);
  return existsSync(path.join(dir, "package.json")) ? dir : null;
}

function collect(name, seen) {
  if (seen.has(name)) return;
  const dir = pkgDir(name);
  if (!dir) return;
  seen.add(name);
  let manifest = {};
  try {
    manifest = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    manifest = {};
  }
  for (const dep of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
    collect(dep, seen);
  }
}

function copyPackage(name) {
  const from = path.join(SRC_NM, name);
  const to = path.join(OUT_NM, name);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true, dereference: true });
}

console.log("==> web player: staging engine workspace…");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

cpSync(path.join(WEB_ROOT, "src"), path.join(OUT, "src"), { recursive: true });
const legacyGames = path.join(OUT, "src", "games");
if (existsSync(legacyGames)) rmSync(legacyGames, { recursive: true, force: true });

cpSync(path.join(WEB_ROOT, "preview.html"), path.join(OUT, "preview.html"));
for (const entry of readdirSync(WEB_ROOT)) {
  if (entry.startsWith("tsconfig") && entry.endsWith(".json")) {
    cpSync(path.join(WEB_ROOT, entry), path.join(OUT, entry));
  }
}

// The editor points a developer's project tsconfig at <workspace>/tsconfig.game.json
// for IDE types. It is apps/web's game config with two layout deltas: staged
// node_modules live under pkg/, and the preview protocol is staged locally.
const gameTsconfig = JSON.parse(readFileSync(path.join(WEB_ROOT, "tsconfig.game.json"), "utf8"));
const gamePaths = gameTsconfig.compilerOptions.paths;
for (const key of Object.keys(gamePaths)) {
  gamePaths[key] = gamePaths[key].map((p) => p.replace("./node_modules/", "./pkg/node_modules/"));
}
gamePaths["@preview-protocol"] = ["./shared/previewProtocol.ts"];
gamePaths["@analytics"] = ["./src/engine/lib/analytics.noop.ts"];
gamePaths.fzstd = ["./pkg/node_modules/fzstd/lib/index.d.ts"];
gamePaths["@wasm-module"] = ["./shared/blackbox_wasm.d.ts"];
writeFileSync(path.join(OUT, "tsconfig.game.json"), `${JSON.stringify(gameTsconfig, null, 2)}\n`);

mkdirSync(path.join(OUT, "shared"), { recursive: true });
cpSync(PROTOCOL_PATH, path.join(OUT, "shared", "previewProtocol.ts"));
cpSync(
  path.join(REPO_ROOT, ".cache", "wasm", "editor-preview", "blackbox_wasm.d.ts"),
  path.join(OUT, "shared", "blackbox_wasm.d.ts"),
);
writeFileSync(
  path.join(OUT, "package.json"),
  `${JSON.stringify({ name: "blackbox-web-player-workspace", private: true, type: "module" }, null, 2)}\n`,
);
mkdirSync(OUT_PKG, { recursive: true });
writeFileSync(
  path.join(OUT_PKG, "package.json"),
  `${JSON.stringify({ name: "blackbox-web-player-workspace-deps", private: true, type: "module" }, null, 2)}\n`,
);

console.log("==> web player: resolving dependency closure…");
const seen = new Set();
for (const root of ROOTS) collect(root, seen);
for (const [scope, pattern] of NATIVE_GLOBS) {
  const scopeDir = path.join(SRC_NM, scope);
  if (!existsSync(scopeDir)) continue;
  for (const entry of readdirSync(scopeDir)) {
    if (pattern.test(entry)) seen.add(`${scope}/${entry}`);
  }
}

console.log(`==> web player: copying ${seen.size} packages…`);
for (const name of seen) copyPackage(name);

console.log(`==> web player: staged workspace to ${OUT}`);
