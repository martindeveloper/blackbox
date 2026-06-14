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

  const icon = loadAppIcon(CLIENT_ROOT);
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
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

app.whenReady().then(async () => {
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

  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
}).catch((error) => {
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

app.on("before-quit", () => {
  void shutdown();
});
