import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSync } from "../../../scripts/lib/spawn.mjs";

const EDITOR_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = path.resolve(EDITOR_ROOT, "../..");
const WEB_ROOT = path.join(REPO_ROOT, "apps", "web");
const WASM_PKG = path.join(REPO_ROOT, ".cache", "wasm", "editor-preview");

const DIST = path.join(EDITOR_ROOT, "dist");
const PREVIEW_DIST = path.join(DIST, "preview");
const PKG_DIST = path.join(DIST, "pkg");

function run(command, args, cwd) {
  runSync(command, args, { cwd });
}

console.log("==> preview: building WASM engine…");
run("npm", ["run", "build:wasm:preview"], WEB_ROOT);

console.log("==> preview: building web preview player…");
run("npm", ["run", "build:preview"], WEB_ROOT);

mkdirSync(PREVIEW_DIST, { recursive: true });
mkdirSync(PKG_DIST, { recursive: true });

copyFileSync(path.join(WEB_ROOT, "preview.html"), path.join(PREVIEW_DIST, "preview.html"));
for (const name of ["preview.js", "style.css"]) {
  copyFileSync(path.join(WEB_ROOT, "dist", "preview", name), path.join(PREVIEW_DIST, name));
}
for (const name of ["blackbox_wasm.js", "blackbox_wasm_bg.wasm"]) {
  copyFileSync(path.join(WASM_PKG, name), path.join(PKG_DIST, name));
}

console.log(`==> preview: synced to ${PREVIEW_DIST} and ${PKG_DIST}`);
