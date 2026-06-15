import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveWorkspaceRoot } from "../players/web/manifest.mjs";

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
export const PREVIEW_CACHE = path.join(USER_DATA_ROOT, ".cache", "preview");
// Writable scratch space for preview toolchain temp files (tailwind wrappers, etc.).
export const PREVIEW_BUILD_CACHE = path.join(USER_DATA_ROOT, ".cache", "preview-build");
export const WORK_DIR = USER_DATA_ROOT;

// Web player workspace: engine sources + preview toolchain. Dev: apps/web.
// Packaged: resources/players/web/workspace (see players/web/manifest.mjs).
export const WEB_PLAYER_WORKSPACE = resolveWorkspaceRoot(process.env, CLIENT_ROOT);
/** @deprecated Use WEB_PLAYER_WORKSPACE */
export const PREVIEW_WEB_ROOT = WEB_PLAYER_WORKSPACE;

export function getToolsDir() {
  return process.env.BLACKBOX_TOOLS_DIR ? path.resolve(process.env.BLACKBOX_TOOLS_DIR) : null;
}

export function bundledToolsEnabled() {
  return Boolean(getToolsDir());
}

export const DEV_MODE = process.argv.includes("--dev");

export const API_VERSION = "v1";
export const API_PREFIX = `/api/${API_VERSION}`;

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
