import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildGameCss } from "../../../scripts/lib/buildGameCss.mjs";
import {
  DEFAULT_PREVIEW_GAME,
  previewUiKey,
  resolvePreviewGameSrc,
} from "../../../scripts/lib/gamePaths.mjs";
import { createWebRolldownResolve } from "../../../scripts/lib/webRolldownResolve.mjs";
import { PREVIEW_CACHE, PREVIEW_WEB_ROOT } from "./config.js";

// Engine + built-in shell sources whose mtimes invalidate a cached preview bundle.
const SHARED_SRC = ["src/engine", "src/preview", "src/shells"];
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const BUILD_CSS = path.join(REPO_ROOT, "scripts", "lib", "buildGameCss.mjs");

// Coalesce concurrent builds of the same UI key into one in-flight promise.
const inFlight = new Map();

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolvePreviewProtocol(web) {
  const staged = path.join(web, "shared", "previewProtocol.ts");
  if (await pathExists(staged)) return staged;
  return path.join(web, "..", "editor", "shared", "previewProtocol.ts");
}

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

async function buildJs(web, gameSrc, outDir) {
  const require = createRequire(path.join(web, "package.json"));
  const { build } = await import(pathToFileURL(require.resolve("rolldown")).href);
  await build({
    input: path.join(web, "src", "preview", "main.tsx"),
    platform: "browser",
    external: ["/pkg/blackbox_wasm.js"],
    cwd: web,
    resolve: createWebRolldownResolve(web, {
      gameSrc,
      aliases: {
        "@content-source": path.join(web, "src", "engine", "lib", "previewSource.ts"),
        "@preview-mode": path.join(web, "src", "engine", "lib", "previewMode.ts"),
        "@preview-protocol": await resolvePreviewProtocol(web),
        "@preview-reporter": path.join(web, "src", "preview", "PreviewReporter.tsx"),
      },
    }),
    transform: { jsx: "react-jsx" },
    output: { file: path.join(outDir, "preview.js"), format: "esm" },
    write: true,
    logLevel: "silent",
  });
}

async function buildGame(web, uiKey, projectPath, gameSrc, force) {
  const outDir = path.join(PREVIEW_CACHE, uiKey);
  const fingerprintFile = path.join(outDir, ".fingerprint");
  const fingerprintRoots = [
    ...SHARED_SRC.map((rel) => path.join(web, rel)),
    BUILD_CSS,
    gameSrc,
  ];
  const fingerprint = String(await maxMtimeMs(fingerprintRoots));

  if (!force) {
    const [prev, hasJs, hasCss] = await Promise.all([
      fs.readFile(fingerprintFile, "utf8").catch(() => null),
      pathExists(path.join(outDir, "preview.js")),
      pathExists(path.join(outDir, "style.css")),
    ]);
    if (prev === fingerprint && hasJs && hasCss) {
      return { game: uiKey, cached: true, durationMs: 0 };
    }
  }

  const started = Date.now();
  await fs.mkdir(outDir, { recursive: true });
  await buildJs(web, gameSrc, outDir);
  await buildGameCss({
    webRoot: web,
    gameSrc,
    outFile: path.join(outDir, "style.css"),
  });
  await fs.writeFile(fingerprintFile, fingerprint);
  return { game: uiKey, cached: false, durationMs: Date.now() - started };
}

/**
 * Compile preview UI for `projectPath` into PREVIEW_CACHE/<uiKey>.
 * Local `<project>/src/` when present; otherwise the generic editor-preview shell.
 * Pass null for unknown projects (generic shell only).
 */
export async function ensurePreviewBuilt(projectPath, { force = false } = {}) {
  const web = PREVIEW_WEB_ROOT;
  const uiKey = projectPath ? previewUiKey(projectPath) : DEFAULT_PREVIEW_GAME;
  const gameSrc = resolvePreviewGameSrc(projectPath, web);

  const key = force ? `${uiKey}:force:${Date.now()}` : uiKey;
  if (!force) {
    const existing = inFlight.get(key);
    if (existing) return existing;
  }
  const promise = buildGame(web, uiKey, projectPath, gameSrc, force).finally(() =>
    inFlight.delete(key),
  );
  inFlight.set(key, promise);
  return promise;
}
