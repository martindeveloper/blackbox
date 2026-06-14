import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_PREVIEW_GAME, PREVIEW_CACHE, PREVIEW_WEB_ROOT } from "./config.js";

// Source dirs whose mtimes invalidate a game's cached bundle.
const SHARED_SRC = ["src/engine", "src/preview"];

// Coalesce concurrent builds of the same game into one in-flight promise.
const inFlight = new Map();

function gameSrcDir(web, game) {
  return path.join(web, "src", "games", game);
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

// previewProtocol.ts lives in the editor (apps/editor/shared) in dev and is
// staged into the workspace for packaging; resolve whichever is present.
async function resolvePreviewProtocol(web) {
  const staged = path.join(web, "shared", "previewProtocol.ts");
  if (await pathExists(staged)) return staged;
  return path.join(web, "..", "editor", "shared", "previewProtocol.ts");
}

// Largest mtime across the given source trees — the cache fingerprint.
async function maxMtimeMs(roots) {
  let newest = 0;
  const walk = async (dir) => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const stat = await fs.stat(dir).catch(() => null);
    if (stat) newest = Math.max(newest, stat.mtimeMs);
    await Promise.all(
      entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        const fileStat = await fs.stat(full).catch(() => null);
        if (fileStat) newest = Math.max(newest, fileStat.mtimeMs);
      }),
    );
  };
  await Promise.all(roots.map(walk));
  return newest;
}

async function buildJs(web, game, outDir) {
  const require = createRequire(path.join(web, "package.json"));
  const { build } = await import(pathToFileURL(require.resolve("rolldown")).href);
  await build({
    input: path.join(web, "src", "preview", "main.tsx"),
    platform: "browser",
    external: ["/pkg/blackbox_wasm.js"],
    cwd: web,
    resolve: {
      // Paths-less tsconfig so tsconfig.json's @game mapping can't override the
      // alias we set here (matches the production rolldown config).
      tsconfigFilename: path.join(web, "tsconfig.bundler.json"),
      alias: {
        "@game": gameSrcDir(web, game),
        "@content-source": path.join(web, "src", "engine", "lib", "previewSource.ts"),
        "@preview-mode": path.join(web, "src", "engine", "lib", "previewMode.ts"),
        "@preview-protocol": await resolvePreviewProtocol(web),
        "@preview-reporter": path.join(web, "src", "preview", "PreviewReporter.tsx"),
      },
    },
    transform: { jsx: "react-jsx" },
    output: { file: path.join(outDir, "preview.js"), format: "esm" },
    write: true,
    logLevel: "silent",
  });
}

function buildCss(web, game, outDir) {
  const require = createRequire(path.join(web, "package.json"));
  const cliPkg = require.resolve("@tailwindcss/cli/package.json");
  const bin = require(cliPkg).bin;
  const cli = path.join(path.dirname(cliPkg), typeof bin === "string" ? bin : bin.tailwindcss);
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cli, "-i", path.join("src", "games", game, "app.css"), "-o", path.join(outDir, "style.css")],
      { cwd: web, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: "pipe" },
    );
    let stderr = "";
    child.stderr?.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`tailwind exited ${code}: ${stderr.trim()}`)),
    );
  });
}

async function buildGame(web, game, force) {
  const outDir = path.join(PREVIEW_CACHE, game);
  const fingerprintFile = path.join(outDir, ".fingerprint");
  const fingerprint = String(
    await maxMtimeMs([...SHARED_SRC.map((rel) => path.join(web, rel)), gameSrcDir(web, game)]),
  );

  if (!force) {
    const [prev, hasJs, hasCss] = await Promise.all([
      fs.readFile(fingerprintFile, "utf8").catch(() => null),
      pathExists(path.join(outDir, "preview.js")),
      pathExists(path.join(outDir, "style.css")),
    ]);
    if (prev === fingerprint && hasJs && hasCss) {
      return { game, cached: true, durationMs: 0 };
    }
  }

  const started = Date.now();
  await fs.mkdir(outDir, { recursive: true });
  await buildJs(web, game, outDir);
  await buildCss(web, game, outDir);
  await fs.writeFile(fingerprintFile, fingerprint);
  return { game, cached: false, durationMs: Date.now() - started };
}

/**
 * Compile the preview player for `game` (its real App/components/CSS) into
 * PREVIEW_CACHE/<game>, reusing the cache unless sources changed or `force`.
 * Unknown/missing games fall back to the generic DEFAULT_PREVIEW_GAME so the
 * preview always renders. Concurrent calls for the same game share one build.
 */
export async function ensurePreviewBuilt(game, { force = false } = {}) {
  const web = PREVIEW_WEB_ROOT;
  let target = game;
  if (!(await pathExists(gameSrcDir(web, target)))) target = DEFAULT_PREVIEW_GAME;
  if (!(await pathExists(gameSrcDir(web, target)))) {
    throw new Error(`Preview game sources not found for "${game}" (web root: ${web})`);
  }

  const key = force ? `${target}:force:${Date.now()}` : target;
  if (!force) {
    const existing = inFlight.get(key);
    if (existing) return existing;
  }
  const promise = buildGame(web, target, force).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
