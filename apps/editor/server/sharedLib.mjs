import path from "node:path";
import { pathToFileURL } from "node:url";
import { CLIENT_ROOT, PACKAGED, getCliDir } from "./config.js";

// gamePaths / buildGameCss / webRolldownResolve are shared build infra owned by
// the repo's scripts/lib and consumed by both the web build and this editor.
//
// In dev we import the canonical files directly — no copy, so there is no stale
// copy to drift and a fresh checkout needs no staging step. The packaged editor
// can't reach the source checkout from inside its asar, so build-electron stages
// the same files into shared/lib and we resolve there instead. Both paths anchor
// on CLIENT_ROOT (the editor app dir) rather than REPO_ROOT, which the Electron
// runtime repoints at the user-data directory. This module is the single seam
// between the two layouts; everything else imports plain symbols from here.
export const SHARED_LIB_ROOT = PACKAGED
  ? path.join(CLIENT_ROOT, "shared", "lib")
  : path.join(CLIENT_ROOT, "..", "..", "scripts", "lib");

const load = (file) => import(pathToFileURL(path.join(SHARED_LIB_ROOT, file)).href);

const gamePaths = await load("gamePaths.mjs");
const buildCss = await load("buildGameCss.mjs");
const rolldownResolve = await load("webRolldownResolve.mjs");
const webBuildAliases = await load("webBuildAliases.mjs");
const spawnLib = await load("spawn.mjs");
const preflightLib = await import(
  pathToFileURL(path.join(getCliDir(), "scripts", "lib", "preflight", "index.mjs")).href
);

export const BUILD_GAME_CSS_PATH = path.join(SHARED_LIB_ROOT, "buildGameCss.mjs");

export const {
  DEFAULT_PREVIEW_GAME,
  PREVIEW_KEY_PATTERN,
  projectHasCustomCode,
  resolvePreviewGameSrc,
} = gamePaths;
export const { buildGameCss } = buildCss;
export const { createWebRolldownResolve } = rolldownResolve;
export const { resolveWebBuildAliases } = webBuildAliases;
export const { commandExists, commandExistsAsync } = spawnLib;
export const { detectBuildCapabilities, createHostCache } = preflightLib;
