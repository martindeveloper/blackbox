import { IDE_PLUGINS } from "../../shared/ideRegistry.js";
import { BUILD_DIR, CACHE_DIR, USER_DIR } from "../../shared/blackboxPaths.js";
import { cursorPlugin } from "./cursor.js";
import { vscodePlugin } from "./vscode.js";

/** @type {Record<string, typeof vscodePlugin>} */
const implementations = {
  vscode: vscodePlugin,
  cursor: cursorPlugin,
};

export function getIdePlugin(id) {
  const meta = IDE_PLUGINS.find((plugin) => plugin.id === id);
  const plugin = implementations[id];
  if (!meta || !plugin) return null;
  return { ...meta, ...plugin };
}

export function listIdePlugins() {
  return IDE_PLUGINS.map((meta) => getIdePlugin(meta.id)).filter(Boolean);
}

const SHARED_GITIGNORE_ENTRIES = [
  "tsconfig.json",
  `${USER_DIR}/`,
  `${BUILD_DIR}/`,
  `${CACHE_DIR}/`,
];

export function collectIdeGitignoreEntries() {
  const pluginEntries = listIdePlugins().flatMap((plugin) => plugin.gitignoreEntries ?? []);
  return [...new Set([...SHARED_GITIGNORE_ENTRIES, ...pluginEntries])];
}

export async function ensureIdeProjectSettings(projectPath, typescriptLib) {
  let changed = false;
  for (const plugin of listIdePlugins()) {
    if (!plugin.ensureProjectSettings) continue;
    changed = (await plugin.ensureProjectSettings(projectPath, { typescriptLib })) || changed;
  }
  return changed;
}
