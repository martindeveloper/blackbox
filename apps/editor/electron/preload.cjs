const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  pickProjectFolder: () => ipcRenderer.invoke("editor:pick-project-folder"),
  setDirty: (dirty) => ipcRenderer.send("editor:set-dirty", dirty),
  onSaveBeforeClose: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("editor:save-before-close", listener);
    return () => ipcRenderer.removeListener("editor:save-before-close", listener);
  },
  reportSaveBeforeClose: (saved) => ipcRenderer.send("editor:save-before-close-result", saved),
});
