import { cpSync, existsSync, mkdirSync, rmSync, watch } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(clientRoot, "../..");
const distRoot = join(clientRoot, "dist");
const www = join(distRoot, "www");
const indexHtml = join(clientRoot, "index.html");
const vercelJson = join(clientRoot, "vercel.json");
const assetsDir = join(clientRoot, "assets");
const pkgDir = join(repoRoot, ".cache/wasm/clients-web");
const wasmGlueFiles = [
  "blackbox_wasm.js",
  "blackbox_wasm_bg.wasm",
  "blackbox_wasm.d.ts",
  "blackbox_wasm_bg.wasm.d.ts",
];
const legacyWasmArtifacts = ["blackbox_wasm.wasm", "package.json"];
const faviconFiles = ["favicon.svg", "favicon.ico", "game-icon.png"];

const watchMode = process.argv.includes("--watch");

function syncFavicons() {
  for (const name of faviconFiles) {
    const source = join(assetsDir, name);
    if (existsSync(source)) {
      cpSync(source, join(www, name));
    } else if (!watchMode) {
      console.warn(`${name} missing — run \`npm run build:favicon\``);
    }
  }
}

function syncWasmPkg() {
  const distPkg = join(www, "pkg");
  let copied = 0;
  for (const name of wasmGlueFiles) {
    const source = join(pkgDir, name);
    if (existsSync(source)) {
      mkdirSync(distPkg, { recursive: true });
      cpSync(source, join(distPkg, name));
      copied += 1;
    }
  }
  for (const name of legacyWasmArtifacts) {
    const stale = join(distPkg, name);
    if (existsSync(stale)) rmSync(stale);
  }

  if (copied === 0 && !watchMode) {
    console.warn(".cache/wasm/clients-web/blackbox_wasm.js missing — run `npm run build:wasm`");
  }
}

function syncVercelConfig() {
  if (existsSync(vercelJson)) {
    mkdirSync(distRoot, { recursive: true });
    cpSync(vercelJson, join(distRoot, "vercel.json"));
  }
}

function syncDist() {
  mkdirSync(www, { recursive: true });
  cpSync(indexHtml, join(www, "index.html"));
  syncFavicons();
  syncWasmPkg();
  syncVercelConfig();
}

syncDist();

if (watchMode) {
  console.log("Watching static assets for dist/www/ sync…");

  watch(indexHtml, { persistent: true }, (eventType) => {
    if (eventType === "change") {
      cpSync(indexHtml, join(www, "index.html"));
      console.log("synced index.html -> dist/www/");
    }
  });

  const faviconSvg = join(assetsDir, "favicon.svg");
  const buildFaviconScript = join(clientRoot, "scripts", "build-favicon.mjs");
  if (existsSync(faviconSvg)) {
    watch(faviconSvg, { persistent: true }, (eventType) => {
      if (eventType === "change") {
        spawnSync(process.execPath, [buildFaviconScript], { stdio: "inherit" });
        syncFavicons();
        console.log("rebuilt and synced favicon assets -> dist/www/");
      }
    });
  }

  for (const name of wasmGlueFiles) {
    const source = join(pkgDir, name);
    if (!existsSync(source)) continue;
    watch(source, { persistent: true }, (eventType) => {
      if (eventType === "change") {
        syncWasmPkg();
        console.log(`synced pkg/${name} -> dist/www/pkg/`);
      }
    });
  }
}
