import fs from "node:fs/promises";
import path from "node:path";
import { collectIdeGitignoreEntries } from "../idePlugins/index.js";

/** OS junk, scratch dirs, accidental installs, and generated build output. */
export const GITIGNORE_BASE_ENTRIES = [
  ".DS_Store",
  "._*",
  ".Spotlight-V100",
  ".Trashes",
  "Thumbs.db",
  "Desktop.ini",
  "ehthumbs.db",
  "tmp/",
  "node_modules/",
  ".blackbox/build/",
  ".blackbox/cache/",
];

export function collectGitIgnoreEntries() {
  return [...new Set([...GITIGNORE_BASE_ENTRIES, ...collectIdeGitignoreEntries()])];
}

function existingLines(contents) {
  return new Set(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
}

/** Create or extend `<project>/.gitignore` with standard adventure ignore rules. */
export async function ensureGitIgnore(projectPath) {
  const target = path.join(projectPath, ".gitignore");
  const existing = await fs.readFile(target, "utf8").catch(() => "");
  const present = existingLines(existing);
  const missing = collectGitIgnoreEntries().filter((entry) => !present.has(entry));
  if (missing.length === 0) return false;

  const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  const header =
    existing.length === 0
      ? "# Blackbox adventure — local/generated paths\n"
      : "\n# Local/generated paths (Blackbox Editor)\n";
  await fs.writeFile(target, `${existing}${prefix}${header}${missing.join("\n")}\n`);
  return true;
}
