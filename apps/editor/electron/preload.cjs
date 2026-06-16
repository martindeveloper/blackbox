const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  pickProjectFolder: () => ipcRenderer.invoke("editor:pick-project-folder"),
  probeIdes: (customPath) => ipcRenderer.invoke("editor:probe-ides", customPath),
  pickIdeBinary: () => ipcRenderer.invoke("editor:pick-ide-binary"),
  openInIde: (projectPath, ideId, customPath) =>
    ipcRenderer.invoke("editor:open-in-ide", projectPath, ideId, customPath),
  revealPath: (targetPath) => ipcRenderer.invoke("editor:reveal-path", targetPath),
  setDirty: (dirty) => ipcRenderer.send("editor:set-dirty", dirty),
  onRequestClose: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("editor:request-close", listener);
    return () => ipcRenderer.removeListener("editor:request-close", listener);
  },
  confirmClose: () => ipcRenderer.send("editor:confirm-close"),
  cancelClose: () => ipcRenderer.send("editor:cancel-close"),
  getCliStagingState: () => ipcRenderer.invoke("editor:cli-staging-state"),
  onCliStaging: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("editor:cli-staging", listener);
    return () => ipcRenderer.removeListener("editor:cli-staging", listener);
  },
});
