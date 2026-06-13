import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

export const EDITOR_SCHEME = "blackbox";
export const EDITOR_ORIGIN = `${EDITOR_SCHEME}://editor`;

const BODYLESS_STATUSES = new Set([101, 204, 205, 304]);
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export function createEditorSocketPath() {
  const suffix = `${process.pid}-${randomUUID().slice(0, 8)}`;
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\blackbox-editor-${suffix}`;
  }
  const uid = typeof process.getuid === "function" ? process.getuid() : "user";
  return path.join(
    os.tmpdir().startsWith("/var/") ? "/tmp" : os.tmpdir(),
    `bb-${uid}-${suffix}.sock`,
  );
}

export async function removeEditorSocket(socketPath) {
  if (process.platform === "win32") return;
  await fs.rm(socketPath, { force: true });
}

function responseHeaders(rawHeaders) {
  const headers = new Headers();
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index];
    const value = rawHeaders[index + 1];
    if (name && value !== undefined && !HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      headers.append(name, value);
    }
  }
  return headers;
}

export function createEditorProtocolHandler(socketPath) {
  return async (request) => {
    const url = new URL(request.url);
    if (url.protocol !== `${EDITOR_SCHEME}:` || url.host !== "editor") {
      return new Response("Not found", { status: 404 });
    }

    const method = request.method.toUpperCase();
    const body =
      method === "GET" || method === "HEAD" ? null : Buffer.from(await request.arrayBuffer());
    const headers = Object.fromEntries(request.headers);
    headers.host = "editor";
    if (body) headers["content-length"] = String(body.length);

    return new Promise((resolve) => {
      const upstream = http.request(
        {
          socketPath,
          path: `${url.pathname}${url.search}`,
          method,
          headers,
        },
        (response) => {
          const status = response.statusCode ?? 502;
          const responseBody =
            method === "HEAD" || BODYLESS_STATUSES.has(status) ? null : Readable.toWeb(response);
          resolve(
            new Response(responseBody, {
              status,
              statusText: response.statusMessage,
              headers: responseHeaders(response.rawHeaders),
            }),
          );
        },
      );

      upstream.once("error", (error) => {
        resolve(new Response(`Editor transport error: ${error.message}`, { status: 502 }));
      });
      request.signal.addEventListener("abort", () => upstream.destroy(), { once: true });
      upstream.end(body);
    });
  };
}
