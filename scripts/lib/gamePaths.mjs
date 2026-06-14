import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export const DEFAULT_PREVIEW_GAME = "editor-preview";
/** Default `@game` UI for standalone apps/web builds when BLACKBOX_WEB_PLAYER_GAME is unset. */
export const DEFAULT_WEB_PLAYER_GAME = DEFAULT_PREVIEW_GAME;
export const PREVIEW_GAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/** `data/<game-id>/src` under a data root. */
export function gameSrcDir(dataRoot, gameId) {
  return path.join(dataRoot, gameId, "src");
}

/** Built-in UI shell shipped with the web engine (`apps/web/src/shells/<id>/`). */
export function shellSrcDir(webRoot, shellId) {
  return path.join(webRoot, "src", "shells", shellId);
}

/** Project-local UI package: `<project>/src/`. */
export function localProjectSrcDir(projectRoot) {
  return path.join(projectRoot, "src");
}

export function projectHasLocalUi(projectRoot) {
  return existsSync(path.join(localProjectSrcDir(projectRoot), "game.ts"));
}

/** Preview cache / asset route segment for a project folder. */
export function previewUiKey(projectRoot) {
  if (projectHasLocalUi(projectRoot)) {
    const name = path.basename(projectRoot);
    if (PREVIEW_GAME_PATTERN.test(name)) return name;
  }
  return DEFAULT_PREVIEW_GAME;
}

/** Resolve preview UI sources for a project (local `src/` or generic shell). */
export function resolvePreviewGameSrc(projectRoot, webRoot) {
  if (projectRoot && projectHasLocalUi(projectRoot)) {
    return localProjectSrcDir(projectRoot);
  }
  return shellSrcDir(webRoot, DEFAULT_PREVIEW_GAME);
}

export function gameManifestPath(dataRoot, gameId) {
  return path.join(gameSrcDir(dataRoot, gameId), "game.ts");
}

export function gameHasSources(dataRoot, gameId) {
  return existsSync(gameManifestPath(dataRoot, gameId));
}

function shellManifestPath(webRoot, shellId) {
  return path.join(shellSrcDir(webRoot, shellId), "game.ts");
}

/**
 * Resolve game UI sources: `data/<game-id>/src` first, then engine shells under
 * `apps/web/src/shells/<game-id>/`.
 */
export function resolveGameSrcDir(gameId, roots, webRoot = null) {
  for (const root of roots) {
    const src = gameSrcDir(root, gameId);
    if (existsSync(path.join(src, "game.ts"))) return src;
  }
  if (webRoot && existsSync(shellManifestPath(webRoot, gameId))) {
    return shellSrcDir(webRoot, gameId);
  }
  return null;
}

/** Repo-relative shipped game packages live under `data/`. */
export function repoGameDataRoot(repoRoot) {
  return path.join(repoRoot, "data");
}

/** Default apps/web root (sibling of repo `data/`). */
export function repoWebRoot(repoRoot) {
  return path.join(repoRoot, "apps", "web");
}

export function listGameIds(dataRoot) {
  if (!existsSync(dataRoot)) return [];
  return readdirSync(dataRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && gameHasSources(dataRoot, entry.name))
    .map((entry) => entry.name)
    .sort();
}
