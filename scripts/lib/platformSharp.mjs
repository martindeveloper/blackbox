import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let sharpModule;
/** Lazy-loaded sharp from apps/web (shared by icon and splash installers). */
export function loadSharp() {
  if (sharpModule) return sharpModule;
  const require = createRequire(import.meta.url);
  const sharpPath = path.join(REPO_ROOT, "apps", "web", "node_modules", "sharp");
  if (!existsSync(sharpPath)) {
    throw new Error("sharp is missing — run `npm install --prefix apps/web`");
  }
  sharpModule = require(sharpPath);
  return sharpModule;
}

let toIcoModule;
export function loadToIco() {
  if (toIcoModule) return toIcoModule;
  const require = createRequire(import.meta.url);
  const toIcoPath = path.join(REPO_ROOT, "apps", "web", "node_modules", "to-ico");
  if (!existsSync(toIcoPath)) {
    throw new Error("to-ico is missing — run `npm install --prefix apps/web`");
  }
  toIcoModule = require(toIcoPath);
  return toIcoModule;
}
