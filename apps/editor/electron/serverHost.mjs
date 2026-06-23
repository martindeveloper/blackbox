import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRpc } from "./ipcRpc.mjs";

const rpc = createRpc((message) => process.parentPort.postMessage(message));
process.parentPort.on("message", (event) => void rpc.dispatch(event.data));

let mcp = null;
let dirty = false;

rpc.on("start", async ({ socketPath, auditLogPath }) => {
  const root = process.env.BLACKBOX_CLIENT_ROOT;
  const { startEditorServer } = await import(moduleUrl(root, "server/app.js"));
  const { EditorMcpServer } = await import(moduleUrl(root, "server/mcpServer.mjs"));

  const server = await startEditorServer({
    quiet: true,
    socketPath,
    projectServiceOptions: { trashItem: (target) => rpc.request("trash", { target }) },
  });

  mcp = new EditorMcpServer({
    projectService: server.projectService,
    isRendererDirty: () => dirty,
    auditLogPath,
  });
});

rpc.on("dirty", ({ value }) => {
  dirty = value === true;
});

rpc.on("mcp", ({ method, args = [] }) => mcp[method](...args));

function moduleUrl(root, relative) {
  return pathToFileURL(path.join(root, ...relative.split("/"))).href;
}
