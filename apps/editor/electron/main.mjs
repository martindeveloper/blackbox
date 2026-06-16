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
import { openInIde, probeIdes } from "./ideHost.mjs";
import { parseCliMode, printEditorCliHelp } from "./cliMode.mjs";
import { applyDarwinShellPath } from "./shellPath.mjs";
import {
  beginCliStaging,
  completeCliStaging,
  failCliStaging,
  getStagingState,
  onCliStaging,
  setStagingState,
} from "../server/cliStaging.js";

const ELECTRON_ROOT = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(ELECTRON_ROOT, "..");
const APP_NAME = "Blackbox Editor";
const SHUTDOWN_TIMEOUT_MS = 1500;

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
let shutdownPromise = null;
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

// Engine binaries shipped beside the editor, named without the platform suffix; the
// executable extension (`.exe` on Windows, none elsewhere) is appended at copy time.
const ENGINE_TOOLS = ["blackbox-bundler", "blackbox-lint", "blackbox-simulator"];
const EXE_SUFFIX = process.platform === "win32" ? ".exe" : "";

// Whether packaged resources live somewhere a plain system `node` (spawned by npm's
// lifecycle runner, without the app's package identity) cannot load native addons or
// execute binaries from — forcing us to stage a writable copy. This is the capability
// the staging logic actually depends on, not the OS name.
//
// Today the only case is Windows MSIX: resources sit under C:\Program Files\WindowsApps,
// whose ACL grants execute only to identity-carrying processes. Linux AppImage (a
// read-only squashfs mounted at a random path that vanishes on exit) is the same shape
// and lights up here for free once that format ships. Plain zip/dmg/deb extract to
// ordinary writable+executable locations and need no staging.
function packagedResourcesNeedStaging(resourcesDir) {
  if (process.platform === "win32") return /[\\/]WindowsApps[\\/]/i.test(resourcesDir);
  if (process.platform === "linux") return Boolean(process.env.APPIMAGE);
  return false;
}

// Copy the packaged engine binaries into a writable per-user dir, refreshing when a
// binary is missing or differs from the packaged copy (e.g. after an app upgrade).
// Returns the staged dir, or falls back to the source dir if staging fails so the
// editor still functions for the identity-preserving direct-spawn paths.
async function stagePackagedTools(sourceDir, userDataDir) {
  const stagedDir = path.join(userDataDir, "bin");
  try {
    await fs.mkdir(stagedDir, { recursive: true });
    for (const base of ENGINE_TOOLS) {
      const name = `${base}${EXE_SUFFIX}`;
      const src = path.join(sourceDir, name);
      const dest = path.join(stagedDir, name);
      const srcStat = await fs.stat(src).catch(() => null);
      if (!srcStat) continue; // tool not present in this build
      const destStat = await fs.stat(dest).catch(() => null);
      const stale =
        !destStat || srcStat.size !== destStat.size || srcStat.mtimeMs > destStat.mtimeMs;
      if (stale) await fs.copyFile(src, dest);
    }
    return stagedDir;
  } catch (error) {
    console.error(`[editor] failed to stage engine tools: ${error.message}`);
    return sourceDir;
  }
}

// The build CLI workspace (apps/web + node_modules with native .node addons,
// prebuilt WASM, build scripts) is ~200 MB / 11k files and must be copied out of the
// ACL-protected WindowsApps package dir before a build can load its native addons
// from a plain system `node`. Copying it synchronously at startup made first launch
// appear to hang, so the decision is made here (cheap) and the copy itself is deferred
// until after the window is shown (see runDeferredCliStaging). Staged once per app
// version, keyed by a stamp file written last so a partial copy restages next launch.
let pendingCliStaging = null;

function decideCliStaging(sourceDir, userDataDir, version) {
  const stagedDir = path.join(userDataDir, "cli");
  const stampFile = path.join(stagedDir, ".staged-version");
  // Record the work to do; runDeferredCliStaging checks the stamp and copies if stale.
  pendingCliStaging = { sourceDir, stagedDir, stampFile, version };
  return stagedDir;
}

async function countFiles(dir) {
  let total = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    total += entry.isDirectory() ? await countFiles(path.join(dir, entry.name)) : 1;
  }
  return total;
}

// Manual recursive copy (fs.cp gives no progress) invoking onFile per copied file.
async function copyTree(src, dest, onFile) {
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyTree(from, to, onFile);
    } else {
      await fs.copyFile(from, to);
      onFile();
    }
  }
}

// Runs after the window is visible. Streams progress through the cliStaging module,
// which the build pipeline gates on and the renderer renders as a banner.
async function runDeferredCliStaging() {
  if (!pendingCliStaging) return;
  const { sourceDir, stagedDir, stampFile, version } = pendingCliStaging;
  pendingCliStaging = null;

  const staged = await fs.readFile(stampFile, "utf8").catch(() => null);
  if (staged === version) return; // already staged for this version — leave readiness as-is

  beginCliStaging();
  try {
    console.log(`[editor] staging build CLI to ${stagedDir} (one-time)…`);
    await fs.rm(stagedDir, { recursive: true, force: true });
    const total = await countFiles(sourceDir);
    let copied = 0;
    await copyTree(sourceDir, stagedDir, () => {
      copied += 1;
      // Throttle renderer updates; always emit the final file.
      if (copied % 64 === 0 || copied === total) {
        setStagingState({ phase: "preparing", copied, total });
      }
    });
    await fs.writeFile(stampFile, version); // written last so a partial copy restages
    console.log("[editor] build CLI staged");
    completeCliStaging();
  } catch (error) {
    console.error(`[editor] failed to stage build CLI: ${error.message}`);
    failCliStaging(error.message);
  }
}

// Single decision point for where the engine tools and the build-CLI workspace resolve
// from. When the packaged resources need staging (see packagedResourcesNeedStaging) it
// points both at writable per-user copies and records the deferred CLI copy; otherwise
// it returns the packaged dirs unchanged. The mechanism — the copy, the readiness gate,
// the progress banner — is identical on every platform; only this predicate is conditional.
async function resolveStagedToolchain({
  packagedBinDir,
  packagedCliDir,
  usePackagedResources,
  userDataDir,
  version,
}) {
  if (!usePackagedResources || !packagedResourcesNeedStaging(process.resourcesPath)) {
    return { toolsDir: packagedBinDir, cliDir: packagedCliDir };
  }
  // The packaged dir is read-only/ACL-protected for spawned children. Stage the engine
  // tools eagerly (small) and the ~200 MB CLI workspace lazily (deferred to post-window).
  return {
    toolsDir: await stagePackagedTools(packagedBinDir, userDataDir),
    cliDir: decideCliStaging(packagedCliDir, userDataDir, version),
  };
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
  process.env.BLACKBOX_APP_ROOT = process.env.BLACKBOX_USER_DATA;
  process.env.BLACKBOX_DATA_ROOTS = [app.getPath("documents"), app.getPath("home")].join(
    path.delimiter,
  );

  // The engine tools (small binaries) and the build-CLI workspace (~200 MB of native
  // .node addons, prebuilt WASM, and scripts) both spawn under a plain system `node`
  // that cannot load executable images out of an ACL-protected package dir. The resolver
  // stages both into a writable per-user dir on platforms that need it (Windows MSIX
  // today), and returns the packaged dirs as-is everywhere else.
  const packagedBinDir = usePackagedResources
    ? path.join(process.resourcesPath, "bin")
    : path.join(CLIENT_ROOT, "resources", "bin");
  const packagedCliDir = usePackagedResources
    ? path.join(process.resourcesPath, "cli")
    : path.resolve(CLIENT_ROOT, "..", "..");
  const { toolsDir, cliDir } = await resolveStagedToolchain({
    packagedBinDir,
    packagedCliDir,
    usePackagedResources,
    userDataDir: process.env.BLACKBOX_USER_DATA,
    version: app.getVersion(),
  });
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
  mainWindow.on("close", (event) => {
    if (closeGuard.allowClose || !closeGuard.dirty) return;
    event.preventDefault();
    mainWindow?.webContents.send("editor:request-close");
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    closeGuard.dirty = false;
    if (isQuitting) {
      void exitAfterShutdown();
    }
  });

  await mainWindow.loadURL(EDITOR_ORIGIN);
}

async function shutdown() {
  if (protocol.isProtocolHandled(EDITOR_SCHEME)) {
    protocol.unhandle(EDITOR_SCHEME);
  }
  if (editorServer) {
    const closing = editorServer.close();
    await Promise.race([
      closing,
      new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
    ]);
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

async function exitAfterShutdown() {
  if (shutdownDone) return;
  shutdownDone = true;
  try {
    await beginShutdown();
  } catch (error) {
    console.error("[editor] shutdown failed:", error instanceof Error ? error.message : error);
  }
  setImmediate(() => app.exit(0));
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
  // No window in headless mode, so stage synchronously before the build runs.
  await runDeferredCliStaging();
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
      // Lets the renderer fetch the current staging state on mount (it may subscribe
      // after the first progress events have already fired).
      ipcMain.handle("editor:cli-staging-state", () => getStagingState());
      // Forward staging progress to the renderer's banner.
      onCliStaging((state) => mainWindow?.webContents.send("editor:cli-staging", state));

      await createWindow();

      // Deferred until the window is shown so first launch is not blocked by the
      // one-time ~200 MB copy out of the read-only package dir (Windows MSIX only).
      void runDeferredCliStaging();

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

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    isQuitting = true;
    void exitAfterShutdown();
  }
});
