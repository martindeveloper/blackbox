import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSync } from "../../../scripts/lib/spawn.mjs";

const EDITOR_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = path.resolve(EDITOR_ROOT, "../..");
const WEB_ROOT = path.join(REPO_ROOT, "apps", "web");
const GAMES_ROOT = path.join(WEB_ROOT, "src", "games");
const WASM_PKG = path.join(REPO_ROOT, ".cache", "wasm", "editor-preview");

const DIST = path.join(EDITOR_ROOT, "dist");
const PREVIEW_DIST = path.join(DIST, "preview");
const PKG_DIST = path.join(DIST, "pkg");

function run(command, args, env = {}) {
  runSync(command, args, { cwd: WEB_ROOT, env: { ...process.env, ...env } });
}

// Every folder under apps/web/src/games that defines a game is a buildable
// preview UI. `editor-preview` is the generic fallback; first-party games
// (e.g. silent-archive) ship their real UI so opening that project previews it.
function discoverGames() {
  return readdirSync(GAMES_ROOT, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(path.join(GAMES_ROOT, entry.name, "game.ts")),
    )
    .map((entry) => entry.name)
    .sort();
}

const games = discoverGames();

// The WASM engine is game-agnostic — build it once and share it across games.
console.log("==> preview: building WASM engine…");
run("npm", ["run", "build:wasm:preview"]);

mkdirSync(PREVIEW_DIST, { recursive: true });
mkdirSync(PKG_DIST, { recursive: true });

// Drop the pre-per-game flat layout if an older build left it behind.
for (const stale of ["preview.js", "style.css"]) {
  rmSync(path.join(PREVIEW_DIST, stale), { force: true });
}

for (const game of games) {
  console.log(`==> preview: building web preview player for "${game}"…`);
  run("npm", ["run", "build:preview"], { BLACKBOX_PREVIEW_GAME: game });

  const gameDist = path.join(PREVIEW_DIST, game);
  mkdirSync(gameDist, { recursive: true });
  for (const name of ["preview.js", "style.css"]) {
    copyFileSync(path.join(WEB_ROOT, "dist", "preview", name), path.join(gameDist, name));
  }
}

// One HTML template for all games; the editor server injects the resolved game
// into its `__GAME__` asset paths per request (see app.js `/preview`).
copyFileSync(path.join(WEB_ROOT, "preview.html"), path.join(PREVIEW_DIST, "preview.html"));
for (const name of ["blackbox_wasm.js", "blackbox_wasm_bg.wasm"]) {
  copyFileSync(path.join(WASM_PKG, name), path.join(PKG_DIST, name));
}

console.log(`==> preview: synced ${games.length} game(s) [${games.join(", ")}] to ${PREVIEW_DIST}`);
