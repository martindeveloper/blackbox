import fs from "node:fs/promises";
import path from "node:path";
import { USER_DATA_ROOT } from "./config.js";
import { EDITOR_SIDECAR_DIR, USER_PREFS_BASENAME } from "../shared/blackboxPaths.js";
import { DEFAULT_IDE_ID, isValidPreferredIde } from "../shared/ideRegistry.js";
import { DEFAULT_MCP_PORT, isValidMcpPort } from "../shared/mcpConfig.js";

const USER_PREFS_PATH = path.join(USER_DATA_ROOT, EDITOR_SIDECAR_DIR, USER_PREFS_BASENAME);
export const DEFAULT_USER_PREFS = Object.freeze({
  theme: "device",
  preferredIde: DEFAULT_IDE_ID,
  mcpEnabled: false,
  mcpPort: DEFAULT_MCP_PORT,
  searchFullTextDefault: false,
});

export async function readUserPrefs() {
  let raw = {};
  try {
    raw = JSON.parse(await fs.readFile(USER_PREFS_PATH, "utf8"));
  } catch {}
  const prefs = normalizeUserPrefs(raw);
  if (needsPrefsBackfill(raw, prefs)) await writeUserPrefs(prefs);
  return prefs;
}

function normalizeUserPrefs(raw) {
  return { ...DEFAULT_USER_PREFS, ...sanitizePrefs(raw) };
}

function needsPrefsBackfill(raw, prefs) {
  return JSON.stringify(raw) !== JSON.stringify(prefs);
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
  if (typeof raw.preferredIde === "string" && isValidPreferredIde(raw.preferredIde)) {
    prefs.preferredIde = raw.preferredIde;
  }
  if (typeof raw.customIdePath === "string") {
    const trimmed = raw.customIdePath.trim();
    if (trimmed) prefs.customIdePath = trimmed;
  }
  if (typeof raw.leftColumnWidth === "number" && Number.isFinite(raw.leftColumnWidth)) {
    prefs.leftColumnWidth = Math.round(raw.leftColumnWidth);
  }
  if (typeof raw.rightColumnWidth === "number" && Number.isFinite(raw.rightColumnWidth)) {
    prefs.rightColumnWidth = Math.round(raw.rightColumnWidth);
  }
  if (typeof raw.mcpEnabled === "boolean") {
    prefs.mcpEnabled = raw.mcpEnabled;
  }
  if (isValidMcpPort(raw.mcpPort)) {
    prefs.mcpPort = raw.mcpPort;
  }
  if (typeof raw.searchFullTextDefault === "boolean") {
    prefs.searchFullTextDefault = raw.searchFullTextDefault;
  }
  return prefs;
}
