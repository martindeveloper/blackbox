const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  fetchEditorVersion: () => ipcRenderer.invoke("editor:fetch-version"),
  pickProjectFolder: () => ipcRenderer.invoke("editor:pick-project-folder"),
  probeIdes: (customPath) => ipcRenderer.invoke("editor:probe-ides", customPath),
  pickIdeBinary: () => ipcRenderer.invoke("editor:pick-ide-binary"),
  openInIde: (projectPath, ideId, customPath) =>
    ipcRenderer.invoke("editor:open-in-ide", projectPath, ideId, customPath),
  revealPath: (targetPath) => ipcRenderer.invoke("editor:reveal-path", targetPath),
  getDependencyInstallInfo: (dependency) =>
    ipcRenderer.invoke("editor:get-dependency-install-info", dependency),
  installDependency: (dependency) => ipcRenderer.invoke("editor:install-dependency", dependency),
  getMcpStatus: () => ipcRenderer.invoke("editor:get-mcp-status"),
  setMcpEnabled: (enabled) => ipcRenderer.invoke("editor:set-mcp-enabled", enabled),
  setMcpPort: (port) => ipcRenderer.invoke("editor:set-mcp-port", port),
  regenerateMcpToken: () => ipcRenderer.invoke("editor:regenerate-mcp-token"),
  getMcpAudit: (limit) => ipcRenderer.invoke("editor:get-mcp-audit", limit),
  setDirty: (dirty) => ipcRenderer.send("editor:set-dirty", dirty),
  onRequestClose: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("editor:request-close", listener);
    return () => ipcRenderer.removeListener("editor:request-close", listener);
  },
  confirmClose: () => ipcRenderer.send("editor:confirm-close"),
  cancelClose: () => ipcRenderer.send("editor:cancel-close"),
});
