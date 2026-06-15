import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { runSync } from "../../../../scripts/lib/spawn.mjs";
import { devEngineRoot, EDITOR_ROOT, REPO_ROOT } from "./manifest.mjs";

// Preview JS/CSS are compiled on demand at runtime (players/web/previewBuild.mjs), per
// the opened project's game. This step only ships the game-agnostic pieces: the
// prebuilt WASM engine and the HTML template (its __GAME__ asset paths are
// filled in per request by the /preview route).
const WEB_ROOT = devEngineRoot();
const WASM_PKG = path.join(REPO_ROOT, ".cache", "wasm", "editor-preview");

const DIST = path.join(EDITOR_ROOT, "dist");
const PREVIEW_DIST = path.join(DIST, "preview");
const PKG_DIST = path.join(DIST, "pkg");

console.log("==> web player: building WASM engine…");
runSync("node", ["./scripts/build-wasm.mjs", "--profile", "dev", "--preview"], { cwd: WEB_ROOT });

mkdirSync(PREVIEW_DIST, { recursive: true });
mkdirSync(PKG_DIST, { recursive: true });

copyFileSync(path.join(WEB_ROOT, "preview.html"), path.join(PREVIEW_DIST, "preview.html"));
for (const name of ["blackbox_wasm.js", "blackbox_wasm_bg.wasm"]) {
  copyFileSync(path.join(WASM_PKG, name), path.join(PKG_DIST, name));
}

console.log(`==> web player: synced WASM + template to ${PREVIEW_DIST}`);
