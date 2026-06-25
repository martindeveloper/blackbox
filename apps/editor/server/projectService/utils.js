import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PACKAGED, REPO_ROOT } from "../config.js";
import { BUILD_DIR, CACHE_DIR, USER_DIR } from "../../shared/blackboxPaths.js";

export const MEDIA_ROOTS = new Set(["textures", "music", "sfx"]);

export function projectRoots() {
  const configured = [
    process.env.BLACKBOX_DATA_ROOT,
    ...(process.env.BLACKBOX_DATA_ROOTS?.split(path.delimiter) ?? []),
  ];
  if (!PACKAGED) configured.push(path.join(REPO_ROOT, "data"));
  if (PACKAGED) configured.push(os.homedir());
  return [...new Set(configured.filter(Boolean).map((root) => path.resolve(root)))];
}

export function isInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function mimeFromName(name) {
  const ext = path.extname(name).toLowerCase();
  return (
    {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
      ".m4a": "audio/mp4",
    }[ext] ?? "application/octet-stream"
  );
}

export async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (fallback !== undefined && error?.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isUserSidecar(relativePath) {
  return relativePath === USER_DIR || relativePath.startsWith(`${USER_DIR}/`);
}

function isGeneratedSidecar(relativePath) {
  for (const dir of [BUILD_DIR, CACHE_DIR]) {
    if (relativePath === dir || relativePath.startsWith(`${dir}/`)) return true;
  }
  return false;
}

function isVersionControlPath(relativePath) {
  return [".git", ".hg", ".svn"].some(
    (directory) => relativePath === directory || relativePath.startsWith(`${directory}/`),
  );
}

const OS_JUNK_BASENAMES = new Set([
  ".ds_store",
  ".apdisk",
  "thumbs.db",
  "ehthumbs.db",
  "desktop.ini",
]);

const OS_JUNK_DIRS = [".spotlight-v100", ".trashes", ".fseventsd", ".documentrevisions-v100"];

function isOsJunkFile(relativePath) {
  const lower = relativePath.toLowerCase();
  if (OS_JUNK_DIRS.some((dir) => lower === dir || lower.startsWith(`${dir}/`))) return true;
  const base = lower.split("/").pop() ?? "";
  return OS_JUNK_BASENAMES.has(base) || base.startsWith("._");
}

export function isIgnoredProjectPath(relativePath) {
  return (
    isUserSidecar(relativePath) ||
    isGeneratedSidecar(relativePath) ||
    isVersionControlPath(relativePath) ||
    isOsJunkFile(relativePath)
  );
}

export async function walkFiles(root, relative = "") {
  const directory = path.join(root, relative);
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (isIgnoredProjectPath(child)) continue;
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, child)));
    } else if (entry.isFile()) files.push(child);
  }
  return files;
}

export function projectRelativePath(projectPath, filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(projectPath, filePath);
  return path.relative(projectPath, absolute).split(path.sep).join("/");
}

export function trashName(originalPath, id) {
  const ext = path.extname(originalPath);
  const base = path.basename(originalPath, ext);
  return `${base}_${id}${ext}`;
}
