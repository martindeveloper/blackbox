import fs from "node:fs/promises";
import path from "node:path";
import { USER_DATA_ROOT } from "./config.js";
import { EDITOR_SIDECAR_DIR, USER_PREFS_BASENAME } from "../shared/blackboxPaths.js";

const USER_PREFS_PATH = path.join(USER_DATA_ROOT, EDITOR_SIDECAR_DIR, USER_PREFS_BASENAME);

export async function readUserPrefs() {
  try {
    const text = await fs.readFile(USER_PREFS_PATH, "utf8");
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function writeUserPrefs(prefs) {
  await fs.mkdir(path.dirname(USER_PREFS_PATH), { recursive: true });
  await fs.writeFile(USER_PREFS_PATH, `${JSON.stringify(prefs, null, 2)}\n`);
}

export function sanitizePrefs(raw) {
  const prefs = {};
  if (raw.theme === "light" || raw.theme === "dark" || raw.theme === "device") {
    prefs.theme = raw.theme;
  }
  if (typeof raw.leftColumnWidth === "number" && Number.isFinite(raw.leftColumnWidth)) {
    prefs.leftColumnWidth = Math.round(raw.leftColumnWidth);
  }
  if (typeof raw.rightColumnWidth === "number" && Number.isFinite(raw.rightColumnWidth)) {
    prefs.rightColumnWidth = Math.round(raw.rightColumnWidth);
  }
  return prefs;
}
