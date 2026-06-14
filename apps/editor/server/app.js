import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import {
  BUNDLE_CACHE,
  PORT,
  LIVERELOAD_PORT,
  DEV_MODE,
  DIST,
  API_PREFIX,
  USER_DATA_ROOT,
  PREVIEW_CACHE,
  PREVIEW_KEY_PATTERN,
} from "./config.js";
import { setupLiveReload, staticFileHandler } from "./static.js";
import { findDefaultDataRoot } from "./editorConfig.js";
import { registerRoutes } from "./routes.js";
import { ProjectService } from "./projectService.js";
import { ensurePreviewBuilt } from "./previewBuild.js";

export async function reservePort(preferred = PORT) {
  const tryPort = (port) =>
    new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once("error", reject);
      server.listen({ port, host: "127.0.0.1" }, () => {
        const address = server.address();
        const chosen = typeof address === "object" && address ? address.port : port;
        server.close((error) => (error ? reject(error) : resolve(chosen)));
      });
    });

  try {
    return await tryPort(preferred);
  } catch {
    return tryPort(0);
  }
}

// Serve a cached preview asset (preview.js / style.css) for a game, guarding the
// game segment against traversal before it touches the filesystem.
async function sendPreviewAsset(reply, game, fileName, contentType) {
  if (!PREVIEW_KEY_PATTERN.test(game)) {
    return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
  }
  try {
    const data = await fs.readFile(path.join(PREVIEW_CACHE, game, fileName));
    return reply.header("Cache-Control", "no-store").type(contentType).send(data);
  } catch {
    return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
  }
}

export async function createEditorServer(options = {}) {
  await fs.mkdir(USER_DATA_ROOT, { recursive: true });
  await fs.mkdir(BUNDLE_CACHE, { recursive: true });
  const projectService =
    options.projectService ?? new ProjectService(options.projectServiceOptions);
  if (!options.projectService) await projectService.start();

  setupLiveReload();

  const fastify = Fastify({ logger: false, bodyLimit: 25 * 1024 * 1024 });
  await fastify.register(multipart);
  fastify.addHook("onRequest", async (request, reply) => {
    if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
      return;
    }
    const origin = request.headers.origin;
    if (!origin) return;
    try {
      if (new URL(origin).host === request.headers.host) return;
    } catch {}
    return reply
      .code(403)
      .send({ code: "forbidden_origin", message: "Cross-origin mutation denied" });
  });
  await fastify.register(async (app) => registerRoutes(app, projectService), {
    prefix: API_PREFIX,
  });

  fastify.setNotFoundHandler(async (request, reply) => {
    const urlPath = request.url.split("?")[0] ?? "/";
    if (urlPath.startsWith("/api/")) {
      return reply.code(404).send({ error: "API route not found" });
    }
    return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
  });

  fastify.get("/preview", async (request, reply) => {
    try {
      const projectId = request.query?.project;
      let project = null;
      if (projectId) {
        try {
          project = projectService.requireProject(projectId);
        } catch {
          project = null;
        }
      }
      const { game } = await ensurePreviewBuilt(project);
      const template = await fs.readFile(path.join(DIST, "preview", "preview.html"), "utf8");
      const html = template.replaceAll("__GAME__", game);
      return reply.header("Cache-Control", "no-store").type("text/html; charset=utf-8").send(html);
    } catch (error) {
      request.log?.error?.(error);
      return reply
        .code(500)
        .type("text/plain; charset=utf-8")
        .send(`Preview build failed: ${error?.message ?? error}`);
    }
  });

  fastify.get("/preview/:game/preview.js", (request, reply) =>
    sendPreviewAsset(reply, request.params.game, "preview.js", "text/javascript; charset=utf-8"),
  );
  fastify.get("/preview/:game/style.css", (request, reply) =>
    sendPreviewAsset(reply, request.params.game, "style.css", "text/css; charset=utf-8"),
  );

  fastify.get("/*", staticFileHandler);

  return { fastify, projectService };
}

export async function startEditorServer(options = {}) {
  const socketPath = options.socketPath ?? null;
  const port = socketPath
    ? null
    : (options.port ?? (await reservePort(options.preferredPort ?? PORT)));
  const host = socketPath ? null : (options.host ?? process.env.HOST ?? "127.0.0.1");
  const { fastify, projectService } = await createEditorServer(options);

  await fastify.ready();

  const dataRoot = await findDefaultDataRoot();
  if (dataRoot) {
    console.log(`Editor data root: ${dataRoot}`);
  } else if (!options.quiet) {
    console.warn("Editor data root not found; set BLACKBOX_DATA_ROOT or open a project folder");
  }

  try {
    await fs.access(path.join(DIST, "index.html"));
  } catch {
    console.warn("dist/ is missing; run: npm run build or npm run dev");
  }

  if (socketPath) {
    await fastify.listen({ path: socketPath });
  } else {
    await fastify.listen({ port, host });
  }

  if (DEV_MODE) {
    console.log(`Live reload enabled on port ${LIVERELOAD_PORT}`);
  }
  if (!options.quiet) {
    console.log(
      socketPath ? `Blackbox editor IPC: ${socketPath}` : `Blackbox editor: http://${host}:${port}`,
    );
  }

  return {
    fastify,
    projectService,
    port,
    host,
    socketPath,
    url: socketPath ? null : `http://${host}:${port}`,
    async close() {
      await projectService.close();
      await fastify.close();
    },
  };
}
