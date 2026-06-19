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
