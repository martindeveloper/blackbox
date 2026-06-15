import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, shell } from "electron";
import { loadAppIcon } from "./icon.mjs";
import {
  createEditorProtocolHandler,
  createEditorSocketPath,
  EDITOR_ORIGIN,
  EDITOR_SCHEME,
  removeEditorSocket,
} from "./local-transport.mjs";
import { setupMacApplicationMenu } from "./menu.mjs";

const ELECTRON_ROOT = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(ELECTRON_ROOT, "..");
const APP_NAME = "Blackbox Editor";

protocol.registerSchemesAsPrivileged([
  {
    scheme: EDITOR_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
]);

if (process.platform === "darwin") {
  process.title = APP_NAME;
}
app.setName(APP_NAME);

let mainWindow = null;
let editorServer = null;
let editorSocketPath = null;
let shutdownPromise = null;

const closeGuard = {
  dirty: false,
  force: false,
  intent: null,
  prompting: false,
  savePending: false,
};

function resetCloseGuard() {
  closeGuard.dirty = false;
  closeGuard.force = false;
  closeGuard.intent = null;
  closeGuard.prompting = false;
  closeGuard.savePending = false;
}

function canCloseImmediately() {
  return closeGuard.force || !closeGuard.dirty;
}

async function configureRuntimePaths() {
  // Renamed macOS dev bundles (see ensure-electron.mjs) still report
  // isPackaged; `electron .` sets process.defaultApp so we can tell dev apart.
  const usePackagedResources = app.isPackaged && !process.defaultApp;

  process.env.BLACKBOX_PACKAGED = usePackagedResources ? "1" : "0";
  process.env.BLACKBOX_STANDALONE = "1";
  process.env.BLACKBOX_CLIENT_ROOT = CLIENT_ROOT;
  process.env.BLACKBOX_USER_DATA = app.getPath("userData");
  await fs.mkdir(process.env.BLACKBOX_USER_DATA, { recursive: true });
  process.env.BLACKBOX_APP_ROOT = process.env.BLACKBOX_USER_DATA;
  process.env.BLACKBOX_DATA_ROOTS = [app.getPath("documents"), app.getPath("home")].join(
    path.delimiter,
  );

  const toolsDir = usePackagedResources
    ? path.join(process.resourcesPath, "bin")
    : path.join(CLIENT_ROOT, "resources", "bin");
  process.env.BLACKBOX_TOOLS_DIR = toolsDir;

  // Shared web engine workspace for on-demand preview builds.
  process.env.BLACKBOX_PREVIEW_WEB_ROOT = usePackagedResources
    ? path.join(process.resourcesPath, "preview-workspace")
    : path.join(CLIENT_ROOT, "..", "web");
}

async function startServer() {
  const serverEntry = pathToFileURL(path.join(CLIENT_ROOT, "server", "app.js")).href;
  const { startEditorServer } = await import(serverEntry);
  editorSocketPath = createEditorSocketPath();
  await removeEditorSocket(editorSocketPath);
  const server = await startEditorServer({
    quiet: true,
    socketPath: editorSocketPath,
    projectServiceOptions: {
      trashItem: (target) => shell.trashItem(target),
    },
  });
  protocol.handle(EDITOR_SCHEME, createEditorProtocolHandler(editorSocketPath));
  return server;
}

async function createWindow() {
  if (!editorServer) {
    editorServer = await startServer();
  }

  resetCloseGuard();

  const icon = loadAppIcon(CLIENT_ROOT);
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: "Blackbox Editor",
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(ELECTRON_ROOT, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("close", (event) => {
    if (canCloseImmediately()) return;
    event.preventDefault();
    void requestClose(closeGuard.intent === "quit" ? "quit" : "window");
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    closeGuard.dirty = false;
  });

  await mainWindow.loadURL(EDITOR_ORIGIN);
}

async function shutdown() {
  if (protocol.isProtocolHandled(EDITOR_SCHEME)) {
    protocol.unhandle(EDITOR_SCHEME);
  }
  if (editorServer) {
    await editorServer.close();
    editorServer = null;
  }
  if (editorSocketPath) {
    await removeEditorSocket(editorSocketPath);
    editorSocketPath = null;
  }
}

function beginShutdown() {
  shutdownPromise ??= shutdown();
  return shutdownPromise;
}

function finishClose(intent) {
  closeGuard.force = true;
  closeGuard.dirty = false;
  closeGuard.savePending = false;
  closeGuard.intent = intent;
  if (intent === "quit") {
    app.quit();
  } else {
    mainWindow?.close();
  }
}

async function requestClose(intent) {
  const window = mainWindow;
  if (!window || window.isDestroyed()) {
    if (intent === "quit") {
      closeGuard.force = true;
      app.quit();
    }
    return;
  }
  if (!closeGuard.dirty) {
    finishClose(intent);
    return;
  }
  if (closeGuard.prompting || closeGuard.savePending) return;

  closeGuard.prompting = true;
  closeGuard.intent = intent;
  try {
    const { response } = await dialog.showMessageBox(window, {
      type: "warning",
      title: "Unsaved changes",
      message: "Save changes before closing?",
      detail: "Your unsaved story changes will be lost if you don't save them.",
      buttons: ["Save", "Don't Save", "Cancel"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });

    if (response === 0) {
      closeGuard.savePending = true;
      window.webContents.send("editor:save-before-close");
      return;
    }
    if (response === 1) {
      finishClose(intent);
      return;
    }
    closeGuard.intent = null;
  } finally {
    closeGuard.prompting = false;
  }
}

app
  .whenReady()
  .then(async () => {
    nativeTheme.themeSource = "system";
    await configureRuntimePaths();

    setupMacApplicationMenu(APP_NAME, CLIENT_ROOT);

    const icon = loadAppIcon(CLIENT_ROOT);
    if (icon && process.platform === "darwin") {
      app.dock.setIcon(icon);
    }
    ipcMain.handle("editor:pick-project-folder", async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory"],
        title: "Open Blackbox project folder",
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    });
    ipcMain.on("editor:set-dirty", (event, dirty) => {
      if (event.sender !== mainWindow?.webContents) return;
      closeGuard.dirty = dirty === true;
    });
    ipcMain.on("editor:save-before-close-result", (event, saved) => {
      if (event.sender !== mainWindow?.webContents || closeGuard.intent === null) return;
      closeGuard.savePending = false;
      if (saved === true) {
        finishClose(closeGuard.intent);
      } else {
        closeGuard.intent = null;
        void dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "Could not save",
          message: "The project could not be saved.",
          detail: "The editor will remain open so you can resolve the problem and try again.",
          buttons: ["OK"],
        });
      }
    });

    await createWindow();

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) await createWindow();
    });
  })
  .catch((error) => {
    console.error("Editor startup failed:", error);
    dialog.showErrorBox(
      "Blackbox Editor failed to start",
      error instanceof Error ? error.message : String(error),
    );
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (!canCloseImmediately()) {
    event.preventDefault();
    void requestClose("quit");
    return;
  }
  void beginShutdown();
});
