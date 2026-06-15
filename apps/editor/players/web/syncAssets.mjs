import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { runSync } from "../../../../scripts/lib/spawn.mjs";
import { devEngineRoot, EDITOR_ROOT, REPO_ROOT } from "./manifest.mjs";

export function syncBuildAssets() {
  const webRoot = devEngineRoot();
  const wasmPkg = path.join(REPO_ROOT, ".cache", "wasm", "editor-preview");

  const dist = path.join(EDITOR_ROOT, "dist");
  const previewDist = path.join(dist, "preview");
  const pkgDist = path.join(dist, "pkg");

  console.log("==> web player: building WASM engine…");
  runSync("node", ["./scripts/build-wasm.mjs", "--profile", "dev", "--preview"], { cwd: webRoot });

  mkdirSync(previewDist, { recursive: true });
  mkdirSync(pkgDist, { recursive: true });

  copyFileSync(path.join(webRoot, "preview.html"), path.join(previewDist, "preview.html"));
  for (const name of ["blackbox_wasm.js", "blackbox_wasm_bg.wasm"]) {
    copyFileSync(path.join(wasmPkg, name), path.join(pkgDist, name));
  }

  console.log(`==> web player: synced WASM + template to ${previewDist}`);
}
