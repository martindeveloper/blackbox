import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBuildConfiguration, resolveBuildPlatform } from "../../../scripts/lib/adventure.mjs";
import { resolveWebOutDir } from "./lib/adventureDev.mjs";
import { buildWebIcons, resolveWebIconSources, resolveWebWwwDir } from "./lib/webIcons.mjs";

const clientRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(clientRoot, "../..");
const deployRoot = resolveWebOutDir(process.env);
const indexHtml = join(clientRoot, "index.html");
const vercelJson = join(clientRoot, "vercel.json");
const pkgDir = join(repoRoot, ".cache/wasm/clients-web");
const wasmGlueFiles = [
  "blackbox_wasm.js",
  "blackbox_wasm_bg.wasm",
  "blackbox_wasm.d.ts",
  "blackbox_wasm_bg.wasm.d.ts",
];
const legacyWasmArtifacts = ["blackbox_wasm.wasm", "package.json"];

const watchMode = process.argv.includes("--watch");
const www = resolveWebWwwDir(process.env);
const configuration = resolveBuildConfiguration(process.env);
const platform = resolveBuildPlatform(process.env);

function syncIndexHtml() {
  let html = readFileSync(indexHtml, "utf8");
  if (configuration === "debug" && platform === "web" && !html.includes("__BLACKBOX_DEV__")) {
    html = html.replace(
      '<script type="module" src="/app.js"></script>',
      '<script>globalThis.__BLACKBOX_DEV__=true;</script>\n    <script type="module" src="/app.js"></script>',
    );
  }
  writeFileSync(join(www, "index.html"), html);
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
    mkdirSync(deployRoot, { recursive: true });
    cpSync(vercelJson, join(deployRoot, "vercel.json"));
  }
}

async function syncDist() {
  mkdirSync(www, { recursive: true });
  syncIndexHtml();
  await buildWebIcons(process.env, { wwwDir: www });
  syncWasmPkg();
  syncVercelConfig();
}

await syncDist();

if (watchMode) {
  console.log(`Watching static assets for ${www} sync…`);

  watch(indexHtml, { persistent: true }, (eventType) => {
    if (eventType === "change") {
      syncIndexHtml();
      console.log(`synced index.html -> ${www}`);
    }
  });

  const iconSources = resolveWebIconSources(process.env);
  const buildFaviconScript = join(clientRoot, "scripts", "build-favicon.mjs");
  if (iconSources?.favicon) {
    watch(iconSources.favicon, { persistent: true }, async (eventType) => {
      if (eventType === "change") {
        await buildWebIcons(process.env, { wwwDir: www });
        console.log(`rebuilt web icons -> ${www}`);
      }
    });
    for (const extra of iconSources.extras) {
      watch(extra.source, { persistent: true }, (eventType) => {
        if (eventType === "change") {
          spawnSync(process.execPath, [buildFaviconScript], { stdio: "inherit" });
          console.log(`synced ${extra.destName} -> ${www}`);
        }
      });
    }
  }

  for (const name of wasmGlueFiles) {
    const source = join(pkgDir, name);
    if (!existsSync(source)) continue;
    watch(source, { persistent: true }, (eventType) => {
      if (eventType === "change") {
        syncWasmPkg();
        console.log(`synced pkg/${name} -> ${www}/pkg/`);
      }
    });
  }
}
