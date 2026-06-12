const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  pickProjectFolder: () => ipcRenderer.invoke("editor:pick-project-folder"),
});
