import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PREVIEW_GAME,
  PREVIEW_GAME_PATTERN,
} from "../../../scripts/lib/gamePaths.mjs";

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

export const CLIENT_ROOT = process.env.BLACKBOX_CLIENT_ROOT
  ? path.resolve(process.env.BLACKBOX_CLIENT_ROOT)
  : path.resolve(SERVER_DIR, "..");

export const REPO_ROOT = process.env.BLACKBOX_APP_ROOT
  ? path.resolve(process.env.BLACKBOX_APP_ROOT)
  : path.resolve(CLIENT_ROOT, "../..");

export const USER_DATA_ROOT = process.env.BLACKBOX_USER_DATA
  ? path.resolve(process.env.BLACKBOX_USER_DATA)
  : REPO_ROOT;

export const PACKAGED = process.env.BLACKBOX_PACKAGED === "1";
export const STANDALONE = process.env.BLACKBOX_STANDALONE === "1";

export const DIST = path.join(CLIENT_ROOT, "dist");
export const BUNDLE_CACHE = path.join(USER_DATA_ROOT, ".cache", "bundle");
// On-demand preview bundles (preview.js + style.css) are compiled here per game.
export const PREVIEW_CACHE = path.join(USER_DATA_ROOT, ".cache", "preview");
export const WORK_DIR = USER_DATA_ROOT;

// Web workspace the preview player engine is built FROM (shared runtime + preview
// entry + rolldown/tailwind toolchain). Dev: apps/web. Packaged: preview-workspace.
export const PREVIEW_WEB_ROOT = process.env.BLACKBOX_PREVIEW_WEB_ROOT
  ? path.resolve(process.env.BLACKBOX_PREVIEW_WEB_ROOT)
  : path.join(REPO_ROOT, "apps", "web");

/** Roots scanned for `data/<game-id>/src` game UI packages. */
export function gameDataRoots() {
  const roots = [];
  if (process.env.BLACKBOX_GAME_DATA_ROOT) {
    roots.push(path.resolve(process.env.BLACKBOX_GAME_DATA_ROOT));
  }
  if (process.env.BLACKBOX_GAME_DATA_ROOTS) {
    roots.push(...process.env.BLACKBOX_GAME_DATA_ROOTS.split(path.delimiter).filter(Boolean));
  }
  if (!PACKAGED) {
    roots.push(path.join(REPO_ROOT, "data"));
  }
  return [...new Set(roots.map((root) => path.resolve(root)))];
}

export function getToolsDir() {
  return process.env.BLACKBOX_TOOLS_DIR ? path.resolve(process.env.BLACKBOX_TOOLS_DIR) : null;
}

export function bundledToolsEnabled() {
  return Boolean(getToolsDir());
}

export const DEV_MODE = process.argv.includes("--dev");

export const API_VERSION = "v1";
export const API_PREFIX = `/api/${API_VERSION}`;

export { DEFAULT_PREVIEW_GAME, PREVIEW_GAME_PATTERN };

export const PORT = Number(process.env.PORT || 8081);
export const LIVERELOAD_PORT = Number(process.env.LIVERELOAD_PORT || 35730);
export const LIVERELOAD_SNIPPET = `<script src="http://localhost:${LIVERELOAD_PORT}/livereload.js?snipver=1"></script>`;

export const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export function toolBinName(name) {
  if (process.platform === "win32" && path.extname(name) === "") return `${name}.exe`;
  return name;
}

export function toolBinPath(name) {
  const toolsDir = getToolsDir();
  if (!toolsDir) return null;
  return path.join(toolsDir, toolBinName(name));
}
