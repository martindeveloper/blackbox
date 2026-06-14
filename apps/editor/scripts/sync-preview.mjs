import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSync } from "../../../scripts/lib/spawn.mjs";

// Preview JS/CSS are compiled on demand at runtime (server/previewBuild.js), per
// the opened project's game. This step only ships the game-agnostic pieces: the
// prebuilt WASM engine and the HTML template (its __GAME__ asset paths are
// filled in per request by the /preview route).
const EDITOR_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = path.resolve(EDITOR_ROOT, "../..");
const WEB_ROOT = path.join(REPO_ROOT, "apps", "web");
const WASM_PKG = path.join(REPO_ROOT, ".cache", "wasm", "editor-preview");

const DIST = path.join(EDITOR_ROOT, "dist");
const PREVIEW_DIST = path.join(DIST, "preview");
const PKG_DIST = path.join(DIST, "pkg");

console.log("==> preview: building WASM engine…");
runSync("npm", ["run", "build:wasm:preview"], { cwd: WEB_ROOT });

mkdirSync(PREVIEW_DIST, { recursive: true });
mkdirSync(PKG_DIST, { recursive: true });

copyFileSync(path.join(WEB_ROOT, "preview.html"), path.join(PREVIEW_DIST, "preview.html"));
for (const name of ["blackbox_wasm.js", "blackbox_wasm_bg.wasm"]) {
  copyFileSync(path.join(WASM_PKG, name), path.join(PKG_DIST, name));
}

console.log(`==> preview: synced WASM + template to ${PREVIEW_DIST}`);
