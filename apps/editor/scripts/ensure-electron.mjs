#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { buildIcnsFromPng } from "./lib/mac-icns.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ELECTRON_DIR = path.join(ROOT, "node_modules", "electron");
const APP_NAME = "Blackbox Editor";
const APP_IDENTIFIER = "com.blackbox.editor.dev";
const MAC_EXECUTABLE_NAME = APP_NAME;
const MAC_BUNDLE_NAME = `${APP_NAME}.app`;

function platformPath() {
  switch (process.platform) {
    case "darwin":
      return `${MAC_BUNDLE_NAME}/Contents/MacOS/${MAC_EXECUTABLE_NAME}`;
    case "win32":
      return "electron.exe";
    default:
      return "electron";
  }
}

async function isInstalled() {
  const relative = platformPath();
  const electronPath = path.join(ELECTRON_DIR, "dist", relative);
  try {
    const [pathText, versionText] = await Promise.all([
      fs.readFile(path.join(ELECTRON_DIR, "path.txt"), "utf8"),
      fs.readFile(path.join(ELECTRON_DIR, "dist", "version"), "utf8"),
    ]);
    const pkg = JSON.parse(await fs.readFile(path.join(ELECTRON_DIR, "package.json"), "utf8"));
    const installedVersion = versionText.trim().replace(/^v/, "");
    return (
      pathText === relative && installedVersion === pkg.version && (await fileExists(electronPath))
    );
  } catch {
    return false;
  }
}

async function fileExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function installFromCache() {
  const { downloadArtifact } = require("@electron/get");
  const { version } = require(path.join(ELECTRON_DIR, "package.json"));
  const arch = process.arch;
  const platform = process.platform;

  const zipPath = await downloadArtifact({
    version,
    artifactName: "electron",
    platform,
    arch,
    checksums: require(path.join(ELECTRON_DIR, "checksums.json")),
  });

  const distDir = path.join(ELECTRON_DIR, "dist");
  await fs.mkdir(distDir, { recursive: true });

  if (process.platform === "win32") {
    const extracted = await extractZipWindows(zipPath, distDir);
    if (!extracted) throw new Error("failed to extract Electron archive on Windows");
  } else {
    const result = spawnSync("unzip", ["-oq", zipPath, "-d", distDir], { stdio: "inherit" });
    if (result.status !== 0) throw new Error("failed to extract Electron archive");
  }

  const relative = platformPath();
  await fs.writeFile(path.join(ELECTRON_DIR, "path.txt"), relative, "utf8");
}

async function extractZipWindows(zipPath, distDir) {
  try {
    const { extract } = require("@electron-internal/extract-zip");
    await extract(zipPath, { dir: path.resolve(distDir) });
    return true;
  } catch (error) {
    console.error("Electron archive extraction failed:", error);
    return false;
  }
}

function setPlistValue(plistPath, key, value) {
  const set = spawnSync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value}`, plistPath], {
    stdio: "ignore",
  });
  if (set.status === 0) return;

  const add = spawnSync(
    "/usr/libexec/PlistBuddy",
    ["-c", `Add :${key} string ${value}`, plistPath],
    { stdio: "ignore" },
  );
  if (add.status !== 0) {
    throw new Error(`failed to write ${key} in Electron Info.plist`);
  }
}

async function resolveDevIconPng() {
  const candidates = [
    path.join(ROOT, "resources", "icon.png"),
    path.join(ROOT, "public", "icon.png"),
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

async function shouldRefreshBundleIcon(pngPath, icnsPath) {
  try {
    const [pngStat, icnsStat] = await Promise.all([fs.stat(pngPath), fs.stat(icnsPath)]);
    return pngStat.mtimeMs > icnsStat.mtimeMs;
  } catch {
    return true;
  }
}

async function installMacBundleIcon(appBundle) {
  const pngPath = await resolveDevIconPng();
  if (!pngPath) return;

  const resourcesDir = path.join(appBundle, "Contents", "Resources");
  const icnsPath = path.join(resourcesDir, "icon.icns");
  if (!(await shouldRefreshBundleIcon(pngPath, icnsPath))) return;

  await buildIcnsFromPng(pngPath, icnsPath);
  const plistPath = path.join(appBundle, "Contents", "Info.plist");
  setPlistValue(plistPath, "CFBundleIconFile", "icon.icns");
  await fs.utimes(icnsPath, new Date(), new Date());
}

async function ensureMacBundleBranding() {
  if (process.platform !== "darwin") return;

  const distDir = path.join(ELECTRON_DIR, "dist");
  const originalBundle = path.join(distDir, "Electron.app");
  const appBundle = path.join(distDir, MAC_BUNDLE_NAME);
  if (!(await fileExists(appBundle)) && (await fileExists(originalBundle))) {
    await fs.rename(originalBundle, appBundle);
  }

  const plistPath = path.join(appBundle, "Contents", "Info.plist");
  if (!(await fileExists(plistPath))) return;

  const executableDir = path.join(appBundle, "Contents", "MacOS");
  const originalExecutable = path.join(executableDir, "Electron");
  const brandedExecutable = path.join(executableDir, MAC_EXECUTABLE_NAME);
  if (!(await fileExists(brandedExecutable)) && (await fileExists(originalExecutable))) {
    await fs.rename(originalExecutable, brandedExecutable);
  }

  setPlistValue(plistPath, "CFBundleName", APP_NAME);
  setPlistValue(plistPath, "CFBundleDisplayName", APP_NAME);
  setPlistValue(plistPath, "CFBundleExecutable", MAC_EXECUTABLE_NAME);
  setPlistValue(plistPath, "CFBundleIdentifier", APP_IDENTIFIER);
  await installMacBundleIcon(appBundle);
  await fs.writeFile(path.join(ELECTRON_DIR, "path.txt"), platformPath(), "utf8");

  // Nudge Launch Services to stop reusing stale bundle metadata during dev.
  await fs.utimes(appBundle, new Date(), new Date());
}

try {
  await fs.access(ELECTRON_DIR);
} catch {
  process.exit(0);
}

if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD === "1") {
  process.exit(0);
}

await ensureMacBundleBranding();

if (!(await isInstalled())) {
  console.log("Installing Electron binary...");
  await installFromCache();
  console.log(`Electron ready (${os.platform()} ${os.arch()})`);
  await ensureMacBundleBranding();
}
