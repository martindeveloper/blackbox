import { IDE_PLUGINS } from "../../shared/ideRegistry.js";
import { cursorPlugin } from "./cursor.mjs";
import { vscodePlugin } from "./vscode.mjs";
import { zedPlugin } from "./zed.mjs";

/** @type {Record<string, typeof vscodePlugin>} */
const implementations = {
  vscode: vscodePlugin,
  cursor: cursorPlugin,
  zed: zedPlugin,
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
