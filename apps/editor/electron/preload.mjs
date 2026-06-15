import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  pickProjectFolder: () => ipcRenderer.invoke("editor:pick-project-folder"),
  probeIdes: (customPath) => ipcRenderer.invoke("editor:probe-ides", customPath),
  pickIdeBinary: () => ipcRenderer.invoke("editor:pick-ide-binary"),
  openInIde: (projectPath, ideId, customPath) =>
    ipcRenderer.invoke("editor:open-in-ide", projectPath, ideId, customPath),
  revealPath: (targetPath) => ipcRenderer.invoke("editor:reveal-path", targetPath),
  setDirty: (dirty) => ipcRenderer.send("editor:set-dirty", dirty),
  onSaveBeforeClose: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("editor:save-before-close", listener);
    return () => ipcRenderer.removeListener("editor:save-before-close", listener);
  },
  reportSaveBeforeClose: (saved) => ipcRenderer.send("editor:save-before-close-result", saved),
});
