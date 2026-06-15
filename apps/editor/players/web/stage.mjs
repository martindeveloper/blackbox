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
import { devEngineRoot, PROTOCOL_PATH, REPO_ROOT, STAGED_WORKSPACE_DIR } from "./manifest.mjs";

// Stage a self-contained workspace the packaged editor builds previews FROM:
// web engine sources + rolldown/tailwind toolchain + a curated node_modules.
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

function pkgDir(srcNm, name) {
  const dir = path.join(srcNm, name);
  return existsSync(path.join(dir, "package.json")) ? dir : null;
}

function collect(srcNm, name, seen) {
  if (seen.has(name)) return;
  const dir = pkgDir(srcNm, name);
  if (!dir) return;
  seen.add(name);
  let manifest = {};
  try {
    manifest = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    manifest = {};
  }
  for (const dep of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
    collect(srcNm, dep, seen);
  }
}

function copyPackage(srcNm, outNm, name) {
  const from = path.join(srcNm, name);
  const to = path.join(outNm, name);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true, dereference: true });
}

export function stageForPackaging() {
  const webRoot = devEngineRoot();
  const srcNm = path.join(webRoot, "node_modules");
  const out = STAGED_WORKSPACE_DIR;
  const outPkg = path.join(out, "pkg");
  const outNm = path.join(outPkg, "node_modules");

  console.log("==> web player: staging engine workspace…");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  cpSync(path.join(webRoot, "src"), path.join(out, "src"), { recursive: true });
  const legacyGames = path.join(out, "src", "games");
  if (existsSync(legacyGames)) rmSync(legacyGames, { recursive: true, force: true });

  cpSync(path.join(webRoot, "preview.html"), path.join(out, "preview.html"));
  for (const entry of readdirSync(webRoot)) {
    if (entry.startsWith("tsconfig") && entry.endsWith(".json")) {
      cpSync(path.join(webRoot, entry), path.join(out, entry));
    }
  }

  const gameTsconfig = JSON.parse(readFileSync(path.join(webRoot, "tsconfig.game.json"), "utf8"));
  const gamePaths = gameTsconfig.compilerOptions.paths;
  for (const key of Object.keys(gamePaths)) {
    gamePaths[key] = gamePaths[key].map((p) => p.replace("./node_modules/", "./pkg/node_modules/"));
  }
  gamePaths["@preview-protocol"] = ["./shared/previewProtocol.ts"];
  gamePaths["@analytics"] = ["./src/engine/lib/analytics.noop.ts"];
  gamePaths.fzstd = ["./pkg/node_modules/fzstd/lib/index.d.ts"];
  gamePaths["@wasm-module"] = ["./shared/blackbox_wasm.d.ts"];
  writeFileSync(path.join(out, "tsconfig.game.json"), `${JSON.stringify(gameTsconfig, null, 2)}\n`);

  mkdirSync(path.join(out, "shared"), { recursive: true });
  cpSync(PROTOCOL_PATH, path.join(out, "shared", "previewProtocol.ts"));
  cpSync(
    path.join(REPO_ROOT, ".cache", "wasm", "editor-preview", "blackbox_wasm.d.ts"),
    path.join(out, "shared", "blackbox_wasm.d.ts"),
  );
  writeFileSync(
    path.join(out, "package.json"),
    `${JSON.stringify({ name: "blackbox-web-player-workspace", private: true, type: "module" }, null, 2)}\n`,
  );
  mkdirSync(outPkg, { recursive: true });
  writeFileSync(
    path.join(outPkg, "package.json"),
    `${JSON.stringify({ name: "blackbox-web-player-workspace-deps", private: true, type: "module" }, null, 2)}\n`,
  );

  console.log("==> web player: resolving dependency closure…");
  const seen = new Set();
  for (const root of ROOTS) collect(srcNm, root, seen);
  for (const [scope, pattern] of NATIVE_GLOBS) {
    const scopeDir = path.join(srcNm, scope);
    if (!existsSync(scopeDir)) continue;
    for (const entry of readdirSync(scopeDir)) {
      if (pattern.test(entry)) seen.add(`${scope}/${entry}`);
    }
  }

  console.log(`==> web player: copying ${seen.size} packages…`);
  for (const name of seen) copyPackage(srcNm, outNm, name);

  console.log(`==> web player: staged workspace to ${out}`);
}
