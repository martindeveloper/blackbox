#!/usr/bin/env node

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import livereload from "livereload";
import { resolveWebWwwDir } from "./scripts/lib/adventureDev.mjs";

const DIST = resolveWebWwwDir(process.env);
const DEV_MODE = process.argv.includes("--dev");

const PORT = Number(process.env.PORT || 8080);
const LIVERELOAD_PORT = Number(process.env.LIVERELOAD_PORT || 35729);
const LIVERELOAD_SNIPPET = `<script>globalThis.__BLACKBOX_DEV__=true;</script><script src="http://localhost:${LIVERELOAD_PORT}/livereload.js?snipver=1"></script>`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".box": "application/octet-stream",
  ".map": "application/json; charset=utf-8",
  ".meta": "application/json; charset=utf-8",
};

if (DEV_MODE) {
  const liveReloadServer = livereload.createServer({
    exts: ["html", "css", "js", "wasm", "json"],
    port: LIVERELOAD_PORT,
  });
  liveReloadServer.watch(DIST);
}

function resolveRequest(urlPath) {
  if (urlPath === "/") {
    return path.join(DIST, "index.html");
  }

  const relative = urlPath.startsWith("/") ? urlPath.slice(1) : urlPath;
  return path.join(DIST, relative);
}

function isInsideRoot(filePath, root) {
  const resolved = path.resolve(filePath);
  const rootResolved = path.resolve(root);
  return resolved === rootResolved || resolved.startsWith(`${rootResolved}${path.sep}`);
}

function maybeInjectLiveReload(html) {
  if (!DEV_MODE || html.includes("livereload.js")) {
    return html;
  }

  if (html.includes("</body>")) {
    return html.replace("</body>", `${LIVERELOAD_SNIPPET}</body>`);
  }

  return `${html}${LIVERELOAD_SNIPPET}`;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const filePath = resolveRequest(url.pathname);

    if (!isInsideRoot(filePath, DIST)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] ?? "application/octet-stream";

    res.writeHead(200, { "Content-Type": type });

    if (DEV_MODE && ext === ".html") {
      res.end(maybeInjectLiveReload(data.toString()));
      return;
    }

    res.end(data);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    console.error(error);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal server error");
  }
});

server.listen(PORT, async () => {
  try {
    await fs.access(path.join(DIST, "index.html"));
  } catch {
    console.warn(
      `${DIST} is missing index.html — run: BLACKBOX_ADVENTURE=<project> npm run build (or dev)`,
    );
  }

  if (DEV_MODE) {
    console.log(`Live reload enabled on port ${LIVERELOAD_PORT}`);
  }

  console.log(`Blackbox web client: http://localhost:${PORT}`);
  console.log(`Serving: ${DIST}`);
});
