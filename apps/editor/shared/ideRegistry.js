/**
 * Canonical list of supported IDEs.
 *
 * To add an editor:
 * 1. Add `{ id, label }` here.
 * 2. Implement `electron/idePlugins/<id>.mjs` and register it in `electron/idePlugins/index.mjs`.
 * 3. If it needs project scaffolding, implement `server/idePlugins/<id>.js` and register it in
 *    `server/idePlugins/index.js`.
 */
export const IDE_PLUGINS = Object.freeze([
  { id: "vscode", label: "Visual Studio Code" },
  { id: "cursor", label: "Cursor" },
  { id: "zed", label: "Zed" },
]);

export const DEFAULT_IDE_ID = IDE_PLUGINS[0].id;

export const CUSTOM_IDE_ID = "custom";

export function isRegisteredIdeId(id) {
  return IDE_PLUGINS.some((plugin) => plugin.id === id);
}

export function isValidPreferredIde(id) {
  return id === CUSTOM_IDE_ID || isRegisteredIdeId(id);
}

export function getIdePluginMeta(id) {
  return IDE_PLUGINS.find((plugin) => plugin.id === id) ?? null;
}
