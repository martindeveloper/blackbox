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

// The preview's npm dependencies are NOT staged here. At runtime the packaged preview resolves
// them from the staged build CLI's web install (resources/cli/apps/web/node_modules), a superset
// of what the preview needs — see configureWebRuntime (BLACKBOX_PLAYER_WEB_DEPS_ROOT) and
// previewBuild.previewRequireFrom. This avoids shipping a second ~50M copy of rolldown/tailwind/
// react. This script stages only the engine sources, tsconfigs, and shared protocol.

export function stageForPackaging() {
  const webRoot = devEngineRoot();
  const out = STAGED_WORKSPACE_DIR;
  const outPkg = path.join(out, "pkg");

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

  console.log(`==> web player: staged workspace to ${out} (deps resolved from staged CLI)`);
}
