import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import {
  createEditorProtocolHandler,
  createEditorSocketPath,
  EDITOR_ORIGIN,
  removeEditorSocket,
} from "../electron/local-transport.mjs";

test("Electron protocol requests travel over IPC without a TCP port", async (context) => {
  const socketPath = createEditorSocketPath();
  await removeEditorSocket(socketPath);

  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          method: request.method,
          url: request.url,
          host: request.headers.host,
          body: Buffer.concat(chunks).toString(),
        }),
      );
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  context.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await removeEditorSocket(socketPath);
  });

  const handle = createEditorProtocolHandler(socketPath);
  const response = await handle(
    new Request(`${EDITOR_ORIGIN}/api/v1/prefs?source=test`, {
      method: "PUT",
      headers: { "content-type": "application/json", origin: EDITOR_ORIGIN },
      body: JSON.stringify({ theme: "dark" }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    method: "PUT",
    url: "/api/v1/prefs?source=test",
    host: "editor",
    body: JSON.stringify({ theme: "dark" }),
  });
});
