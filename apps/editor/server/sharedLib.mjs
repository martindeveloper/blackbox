import path from "node:path";
import { pathToFileURL } from "node:url";
import { CLIENT_ROOT, PACKAGED, REPO_ROOT } from "./config.js";

// gamePaths / buildGameCss / webRolldownResolve are shared build infra owned by
// the repo's scripts/lib and consumed by both the web build and this editor.
//
// In dev we import the canonical files directly — no copy, so there is no stale
// copy to drift and a fresh checkout needs no staging step. The packaged editor
// can't reach repo root from inside its asar, so build-electron stages the same
// files into shared/lib and we resolve there instead. This module is the single
// seam between the two layouts; everything else imports plain symbols from here.
export const SHARED_LIB_ROOT = PACKAGED
  ? path.join(CLIENT_ROOT, "shared", "lib")
  : path.join(REPO_ROOT, "scripts", "lib");

const load = (file) => import(pathToFileURL(path.join(SHARED_LIB_ROOT, file)).href);

const gamePaths = await load("gamePaths.mjs");
const buildCss = await load("buildGameCss.mjs");
const rolldownResolve = await load("webRolldownResolve.mjs");

/** Absolute path to the buildGameCss source — a fingerprint input for the cache. */
export const BUILD_GAME_CSS_PATH = path.join(SHARED_LIB_ROOT, "buildGameCss.mjs");

export const {
  DEFAULT_PREVIEW_GAME,
  PREVIEW_KEY_PATTERN,
  projectHasLocalUi,
  resolvePreviewGameSrc,
} = gamePaths;
export const { buildGameCss } = buildCss;
export const { createWebRolldownResolve } = rolldownResolve;
