import fs from "node:fs/promises";
import path from "node:path";
import livereload from "livereload";
import { DIST, DEV_MODE, LIVERELOAD_PORT, LIVERELOAD_SNIPPET, MIME } from "./config.js";

export function setupLiveReload() {
  if (!DEV_MODE) return;
  const liveReloadServer = livereload.createServer({
    exts: ["html", "css", "js", "json"],
    port: LIVERELOAD_PORT,
  });
  liveReloadServer.watch(DIST);
}

export function resolveRequest(urlPath) {
  if (urlPath === "/") return path.join(DIST, "index.html");
  const relative = urlPath.startsWith("/") ? urlPath.slice(1) : urlPath;
  return path.join(DIST, relative);
}

export function isInsideRoot(filePath, root) {
  const resolved = path.resolve(filePath);
  const rootResolved = path.resolve(root);
  return resolved === rootResolved || resolved.startsWith(`${rootResolved}${path.sep}`);
}

function maybeInjectLiveReload(html) {
  if (!DEV_MODE || html.includes("livereload.js")) return html;
  if (html.includes("</body>")) return html.replace("</body>", `${LIVERELOAD_SNIPPET}</body>`);
  return `${html}${LIVERELOAD_SNIPPET}`;
}

export async function staticFileHandler(request, reply) {
  const urlPath = request.url.split("?")[0] ?? "/";
  if (urlPath.startsWith("/api/")) {
    return reply.code(404).send({ error: "API route not found" });
  }

  const filePath = resolveRequest(urlPath);

  if (!isInsideRoot(filePath, DIST)) {
    return reply.code(403).type("text/plain; charset=utf-8").send("Forbidden");
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] ?? "application/octet-stream";

    if (urlPath.startsWith("/preview/")) {
      reply.header("Cache-Control", "no-store");
    }

    if (DEV_MODE && ext === ".html") {
      return reply.type(type).send(maybeInjectLiveReload(data.toString()));
    }

    return reply.type(type).send(data);
  } catch (error) {
    if (error?.code === "ENOENT") return reply.callNotFound();
    console.error(error);
    return reply.code(500).type("text/plain; charset=utf-8").send("Internal server error");
  }
}
