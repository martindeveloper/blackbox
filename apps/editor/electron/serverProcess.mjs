import path from "node:path";
import { fileURLToPath } from "node:url";
import { shell, utilityProcess } from "electron";
import { createRpc } from "./ipcRpc.mjs";

const HOST_ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "serverHost.mjs");

export class EditorServerProcess {
  constructor() {
    this.child = null;
    this.rpc = null;
    this.stopping = false;
    this.mcp = {
      status: () => this.rpc.request("mcp", { method: "status" }),
      start: (options) => this.rpc.request("mcp", { method: "start", args: [options] }),
      stop: () => this.rpc.request("mcp", { method: "stop" }),
      replaceToken: (token) => this.rpc.request("mcp", { method: "replaceToken", args: [token] }),
      readAudit: (limit) => this.rpc.request("mcp", { method: "readAudit", args: [limit] }),
    };
  }

  async start({ socketPath, auditLogPath }) {
    this.child = utilityProcess.fork(HOST_ENTRY, [], {
      serviceName: "blackbox-editor-server",
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Route the child's output through the main process streams, which are teed
    // to userData/logs (logFile.mjs). Forward manually rather than pipe() so the
    // child exiting never ends the main process streams.
    this.child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
    this.child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
    this.rpc = createRpc((message) => this.child?.postMessage(message));
    this.rpc.on("trash", ({ target }) => shell.trashItem(target));
    this.child.on("message", (message) => void this.rpc.dispatch(message));
    this.child.on("exit", (code) => {
      this.rpc.rejectAll(new Error(`Editor server exited (code ${code})`));
      this.child = null;
      if (!this.stopping)
        console.error(`[editor] server process exited unexpectedly (code ${code})`);
    });

    await this.rpc.request("start", { socketPath, auditLogPath });
  }

  setDirty(dirty) {
    this.child?.postMessage({ type: "dirty", value: dirty });
  }

  kill() {
    this.stopping = true;
    this.child?.kill();
    this.child = null;
  }
}
