import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, shell } from "electron";
import { loadAppIcon } from "./icon.mjs";
import { initFileLogging } from "./logFile.mjs";
import {
  createEditorProtocolHandler,
  createEditorSocketPath,
  EDITOR_ORIGIN,
  EDITOR_SCHEME,
  removeEditorSocket,
} from "./local-transport.mjs";
import { setupMacApplicationMenu } from "./menu.mjs";
import { openInIde, probeIdes } from "./ideHost.mjs";
import { parseCliMode, printEditorCliHelp } from "./cliMode.mjs";
import { applyDarwinShellPath } from "./shellPath.mjs";

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
  const startupIcon = loadAppIcon(CLIENT_ROOT);
  if (startupIcon && app.dock) {
    app.dock.setIcon(startupIcon);
  }
}
app.setName(APP_NAME);

let mainWindow = null;
let editorServer = null;
let editorSocketPath = null;
// Set on before-quit so confirm-close can call app.quit() vs window.close().
let isQuitting = false;
let shutdownDone = false;

const closeGuard = {
  dirty: false,
  allowClose: false,
};

function resetCloseGuard() {
  closeGuard.dirty = false;
  closeGuard.allowClose = false;
  isQuitting = false;
}

async function configureRuntimePaths() {
  applyDarwinShellPath();

  // Renamed macOS dev bundles (see ensure-electron.mjs) still report
  // isPackaged; `electron .` sets process.defaultApp so we can tell dev apart.
  const usePackagedResources = app.isPackaged && !process.defaultApp;

  process.env.BLACKBOX_PACKAGED = usePackagedResources ? "1" : "0";
  process.env.BLACKBOX_STANDALONE = "1";
  process.env.BLACKBOX_CLIENT_ROOT = CLIENT_ROOT;
  process.env.BLACKBOX_USER_DATA = app.getPath("userData");
  await fs.mkdir(process.env.BLACKBOX_USER_DATA, { recursive: true });
  const logPath = initFileLogging(process.env.BLACKBOX_USER_DATA);
  if (logPath) console.log(`[editor] logging to ${logPath}`);
  process.env.BLACKBOX_APP_ROOT = process.env.BLACKBOX_USER_DATA;
  process.env.BLACKBOX_DATA_ROOTS = [app.getPath("documents"), app.getPath("home")].join(
    path.delimiter,
  );

  // The engine tools and the build-CLI workspace run in place from the packaged
  // resources. On Windows MSIX these live under the ACL-protected WindowsApps dir, which
  // only grants execute/addon-load to processes carrying the package identity — so the
  // whole build subtree is launched with the in-package runtime (process.execPath) rather
  // than via npm/system node, which keeps identity and avoids copying anything out.
  const toolsDir = usePackagedResources
    ? path.join(process.resourcesPath, "bin")
    : path.join(CLIENT_ROOT, "resources", "bin");
  const cliDir = usePackagedResources
    ? path.join(process.resourcesPath, "cli")
    : path.resolve(CLIENT_ROOT, "..", "..");
  process.env.BLACKBOX_TOOLS_DIR = toolsDir;
  process.env.BLACKBOX_CLI_DIR = cliDir;
  if (usePackagedResources) {
    process.env.BLACKBOX_WASM_PREBUILT_DIR = path.join(cliDir, ".cache", "wasm", "clients-web");
    process.env.BLACKBOX_BUILD_CACHE_DIR = path.join(process.env.BLACKBOX_USER_DATA, ".cache");
  }

  const { configurePlayerRuntimes } = await import("../players/registry.mjs");
  configurePlayerRuntimes({
    usePackagedResources,
    clientRoot: CLIENT_ROOT,
    resourcesPath: process.resourcesPath,
    env: process.env,
  });
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
  // Direct window close (red traffic-light / Alt+F4). App-level quit (Cmd+Q,
  // dock Quit, menu) is handled by the before-quit listener instead.
  mainWindow.on("close", (event) => {
    if (closeGuard.allowClose || !closeGuard.dirty) return;
    event.preventDefault();
    mainWindow?.webContents.send("editor:request-close");
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    closeGuard.dirty = false;
    // On Windows this is followed by window-all-closed, which calls forceExit.
    // On macOS the app intentionally stays resident until an explicit quit
    // (Cmd+Q / dock / menu), which is handled by the before-quit listener.
  });

  await mainWindow.loadURL(EDITOR_ORIGIN);
}

// Terminate the process. The catch on macOS/Linux: a normal exit (app.exit /
// process.exit) runs Node's environment teardown, which synchronously finalizes
// the still-open node:sqlite DatabaseSync handle. That close performs a blocking
// WAL checkpoint and wedges the main thread — and once the thread is blocked in
// native code no timer or further JS can rescue it. That is the macOS Cmd+Q
// freeze (the window closes, then the process hangs in teardown).
//
// SIGKILL is delivered by the kernel and terminates immediately without running
// any teardown, so the blocking close never executes. This is safe here: SQLite
// WAL is crash-consistent (all writes autocommit and the DB recovers on next
// open) and the unix socket is removed at the start of the next launch
// (startServer -> removeEditorSocket). We destroy the windows first so the
// renderer/GPU helper processes shut down cleanly before the browser process
// disappears. Windows never exhibited the freeze, so it keeps the normal exit.
function forceExit() {
  if (shutdownDone) return;
  shutdownDone = true;

  if (process.platform === "win32") {
    app.exit(0);
    return;
  }

  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.destroy();
    } catch {
      /* window already gone */
    }
  }
  process.kill(process.pid, "SIGKILL");
}

function confirmCloseFromRenderer() {
  closeGuard.allowClose = true;
  closeGuard.dirty = false;
  if (isQuitting) {
    app.quit();
    return;
  }
  mainWindow?.close();
}

function cancelCloseFromRenderer() {
  isQuitting = false;
}

const cliArgs = parseCliMode(process.argv);

async function runHeadlessCli(forwardedArgs) {
  if (process.platform === "darwin" && app.dock) {
    app.dock.hide();
  }
  await configureRuntimePaths();
  if (forwardedArgs.length === 0) {
    printEditorCliHelp();
    return 1;
  }
  const { runCli } = await import("../server/pipeline/cli.js");
  return runCli(forwardedArgs, { inheritStdio: true });
}

if (cliArgs !== null) {
  app
    .whenReady()
    .then(async () => {
      const exitCode = await runHeadlessCli(cliArgs);
      app.exit(exitCode);
    })
    .catch((error) => {
      console.error("[editor] CLI failed:", error instanceof Error ? error.message : error);
      app.exit(1);
    });
} else {
  app
    .whenReady()
    .then(async () => {
      nativeTheme.themeSource = "system";
      await configureRuntimePaths();

      setupMacApplicationMenu(APP_NAME, CLIENT_ROOT);

      ipcMain.handle("editor:pick-project-folder", async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
          properties: ["openDirectory"],
          title: "Open Blackbox project folder",
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0];
      });
      ipcMain.handle("editor:probe-ides", async (event, customPath) => {
        if (event.sender !== mainWindow?.webContents)
          return { plugins: [], customAvailable: false };
        if (customPath !== undefined && typeof customPath !== "string") {
          return { plugins: [], customAvailable: false };
        }
        return probeIdes(customPath);
      });
      ipcMain.handle("editor:pick-ide-binary", async (event) => {
        if (event.sender !== mainWindow?.webContents) return null;
        const result = await dialog.showOpenDialog(mainWindow, {
          properties: ["openFile"],
          title: "Select IDE executable",
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0];
      });
      ipcMain.handle("editor:open-in-ide", async (event, projectPath, ideId, customPath) => {
        if (event.sender !== mainWindow?.webContents) return false;
        if (typeof projectPath !== "string" || projectPath.includes("\0")) return false;
        if (ideId !== undefined && typeof ideId !== "string") return false;
        if (customPath !== undefined && typeof customPath !== "string") return false;
        const resolved = path.resolve(projectPath);
        const stat = await fs.stat(resolved).catch(() => null);
        if (!stat?.isDirectory()) return false;
        return openInIde(resolved, ideId, customPath);
      });
      ipcMain.handle("editor:reveal-path", async (event, targetPath) => {
        if (event.sender !== mainWindow?.webContents) return false;
        if (typeof targetPath !== "string" || targetPath.includes("\0")) return false;
        const resolved = path.resolve(targetPath);
        const stat = await fs.stat(resolved).catch(() => null);
        if (!stat) return false;
        if (stat.isDirectory()) {
          return (await shell.openPath(resolved)) === "";
        }
        shell.showItemInFolder(resolved);
        return true;
      });
      ipcMain.on("editor:set-dirty", (event, dirty) => {
        if (event.sender !== mainWindow?.webContents) return;
        closeGuard.dirty = dirty === true;
      });
      ipcMain.on("editor:confirm-close", (event) => {
        if (event.sender !== mainWindow?.webContents) return;
        confirmCloseFromRenderer();
      });
      ipcMain.on("editor:cancel-close", (event) => {
        if (event.sender !== mainWindow?.webContents) return;
        cancelCloseFromRenderer();
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
}

// Authoritative quit path for Cmd+Q, dock Quit, and the app menu. macOS never
// quits from window-all-closed, so we take over the quit here: prompt for
// unsaved work if needed, then exit the process directly via forceExit().
app.on("before-quit", (event) => {
  isQuitting = true;
  if (shutdownDone) return;

  // Prompt for unsaved work before exiting. The renderer answers via
  // confirm-close / cancel-close, which re-enters this handler (now clean).
  if (closeGuard.dirty && !closeGuard.allowClose && mainWindow && !mainWindow.isDestroyed()) {
    event.preventDefault();
    mainWindow.webContents.send("editor:request-close");
    return;
  }

  forceExit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    isQuitting = true;
    forceExit();
  }
});
