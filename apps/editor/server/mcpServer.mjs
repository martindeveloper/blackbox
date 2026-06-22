import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";
import { McpAuditLog } from "./mcpAuditLog.mjs";
import { executeLinter, executeSimulator } from "./routes.js";

const HOST = "127.0.0.1";
const MCP_PATH = "/mcp";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_SEARCH_RESULTS = 100;

function jsonText(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function toolError(error) {
  const code = typeof error?.code === "string" ? error.code : "mcp_tool_error";
  const message = error instanceof Error ? error.message : String(error);
  const details = error?.details && typeof error.details === "object" ? error.details : undefined;
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ code, message, ...details }, null, 2) }],
  };
}

function publicProject(project) {
  return {
    id: project.id,
    name: project.name,
    title: project.title,
    revision: project.revision,
    lastOpened: project.lastOpened,
    codeTrusted: project.codeTrusted,
    hasCustomCode: project.hasCustomCode,
  };
}

function publicSnapshot(snapshot, { includeLayout = false, includeMedia = false } = {}) {
  const { scenarioDir: _scenarioDir, ...bundle } = { ...snapshot.bundle };
  if (!includeLayout) delete bundle.layout;
  return {
    project: publicProject(snapshot.project),
    bundle,
    ...(includeMedia ? { mediaFiles: snapshot.mediaFiles } : {}),
  };
}

function findNode(snapshot, chapterId, nodeId) {
  if (chapterId === "scenario") {
    const node = snapshot.bundle.scenario.nodes?.[nodeId];
    return node ? { chapterId, nodeId, node } : null;
  }
  const chapter = snapshot.bundle.chapters[chapterId];
  const node = chapter?.nodes?.[nodeId];
  return node ? { chapterId, chapterTitle: chapter.title, nodeId, node } : null;
}

function searchValue(value, query, path, results) {
  if (results.length >= MAX_SEARCH_RESULTS) return;
  if (typeof value === "string") {
    const index = value.toLocaleLowerCase().indexOf(query);
    if (index >= 0) {
      results.push({
        path,
        text: value.length > 320 ? `${value.slice(0, 317)}…` : value,
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => searchValue(entry, query, `${path}[${index}]`, results));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      searchValue(entry, query, path ? `${path}.${key}` : key, results);
      if (results.length >= MAX_SEARCH_RESULTS) return;
    }
  }
}

async function readJsonBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("MCP request body is too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function tokenMatches(header, token) {
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const supplied = header.slice(7);
  const expectedHash = createHash("sha256").update(token).digest();
  const suppliedHash = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedHash, suppliedHash);
}

function sendJson(response, statusCode, value, headers = {}) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(value));
}

function auditArguments(tool, args) {
  const summary = {};
  for (const key of [
    "projectId",
    "chapterId",
    "nodeId",
    "expectedRevision",
    "includeLayout",
    "includeMedia",
    "mode",
    "goalBudget",
    "maxStates",
    "threads",
    "heuristic",
    "check",
    "analytics",
  ]) {
    if (args?.[key] !== undefined) summary[key] = args[key];
  }
  if (tool === "save_documents" && args?.documents && typeof args.documents === "object") {
    summary.documentPaths = Object.keys(args.documents);
  }
  if (tool === "lint_project") {
    summary.ignoreCount = Array.isArray(args?.ignore) ? args.ignore.length : 0;
    summary.onlyCount = Array.isArray(args?.only) ? args.only.length : 0;
  }
  return summary;
}

function createProtocolServer({ projectService, isRendererDirty, auditTool, client }) {
  const server = new McpServer(
    {
      name: "blackbox-editor",
      version: "1.0.0",
    },
    {
      instructions:
        "Use project revisions for every mutation. Read a project immediately before saving. " +
        "If a revision conflict occurs, read again and reconcile instead of forcing an overwrite.",
    },
  );

  const readSnapshot = async (projectId) => projectService.openProject(projectId, false);
  const mutationGuard = () => {
    if (isRendererDirty()) {
      const error = new Error(
        "The editor has unsaved changes. Ask the user to save or discard them before an agent mutation.",
      );
      error.code = "editor_dirty";
      throw error;
    }
  };
  const registerTool = (name, config, handler) => {
    server.registerTool(name, config, async (args, extra) => {
      const started = Date.now();
      let result;
      try {
        result = await handler(args, extra);
        return result;
      } catch (error) {
        result = toolError(error);
        return result;
      } finally {
        void auditTool({
          type: "tool",
          client,
          tool: name,
          arguments: auditArguments(name, args),
          outcome: result?.isError === true ? "error" : "success",
          durationMs: Date.now() - started,
        });
      }
    });
  };

  server.registerResource(
    "blackbox-projects",
    "blackbox://projects",
    {
      title: "Blackbox projects",
      description: "Projects registered in the running Blackbox Editor",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            { projects: projectService.listProjects().map(publicProject) },
            null,
            2,
          ),
        },
      ],
    }),
  );

  registerTool(
    "list_projects",
    {
      title: "List Blackbox projects",
      description: "List projects already registered in the running editor.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => jsonText({ projects: projectService.listProjects().map(publicProject) }),
  );

  registerTool(
    "read_project",
    {
      title: "Read project",
      description:
        "Read authored scenario, chapters, and catalogs. Layout and media are omitted unless requested.",
      inputSchema: {
        projectId: z.string().min(1),
        includeLayout: z.boolean().default(false),
        includeMedia: z.boolean().default(false),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId, includeLayout, includeMedia }) => {
      return jsonText(
        publicSnapshot(await readSnapshot(projectId), { includeLayout, includeMedia }),
      );
    },
  );

  registerTool(
    "get_node",
    {
      title: "Get story node",
      description:
        "Read one node by chapter and node ID. Use chapterId 'scenario' for legacy inline nodes.",
      inputSchema: {
        projectId: z.string().min(1),
        chapterId: z.string().min(1),
        nodeId: z.string().min(1),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId, chapterId, nodeId }) => {
      const snapshot = await readSnapshot(projectId);
      const result = findNode(snapshot, chapterId, nodeId);
      if (!result) {
        throw Object.assign(new Error(`Node not found: ${chapterId}/${nodeId}`), {
          code: "not_found",
        });
      }
      return jsonText({ revision: snapshot.project.revision, ...result });
    },
  );

  registerTool(
    "search_project",
    {
      title: "Search project text",
      description:
        "Search string values across scenario, chapters, and catalogs. Returns at most 100 matches.",
      inputSchema: {
        projectId: z.string().min(1),
        query: z.string().trim().min(1).max(200),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId, query }) => {
      const snapshot = await readSnapshot(projectId);
      const results = [];
      searchValue(snapshot.bundle, query.toLocaleLowerCase(), "", results);
      return jsonText({
        revision: snapshot.project.revision,
        query,
        matches: results,
        truncated: results.length >= MAX_SEARCH_RESULTS,
      });
    },
  );

  registerTool(
    "save_documents",
    {
      title: "Save project documents",
      description:
        "Atomically save one or more authored JSON documents. Requires the exact current project revision.",
      inputSchema: {
        projectId: z.string().min(1),
        expectedRevision: z.number().int().positive(),
        documents: z.record(z.string().min(1), z.unknown()),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ projectId, expectedRevision, documents }) => {
      mutationGuard();
      await readSnapshot(projectId);
      return jsonText(
        await projectService.saveDocuments(projectId, {
          baseRevision: expectedRevision,
          documents,
          force: false,
          clientId: "mcp",
        }),
      );
    },
  );

  registerTool(
    "lint_project",
    {
      title: "Lint project",
      description: "Run Blackbox validation against the exact requested project revision.",
      inputSchema: {
        projectId: z.string().min(1),
        expectedRevision: z.number().int().positive(),
        ignore: z.array(z.string()).default([]),
        only: z.array(z.string()).default([]),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId, expectedRevision, ignore, only }) => {
      await readSnapshot(projectId);
      return jsonText(
        await executeLinter(projectService, projectId, {
          expectedRevision,
          ignore,
          only,
        }),
      );
    },
  );

  registerTool(
    "simulate_project",
    {
      title: "Simulate project",
      description: "Explore story reachability and endings at the exact requested revision.",
      inputSchema: {
        projectId: z.string().min(1),
        expectedRevision: z.number().int().positive(),
        mode: z.enum(["goals", "explore"]).default("goals"),
        goals: z.string().default("ending"),
        goalBudget: z.number().int().positive().default(50_000),
        maxStates: z.number().int().positive().default(500_000),
        threads: z.number().int().nonnegative().default(0),
        heuristic: z.enum(["graph", "none"]).default("graph"),
        check: z.boolean().default(true),
        analytics: z.boolean().default(false),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (options) => {
      await readSnapshot(options.projectId);
      return jsonText(
        await executeSimulator(projectService, options.projectId, {
          expectedRevision: options.expectedRevision,
          mode: options.mode,
          goals: options.goals,
          goalBudget: options.goalBudget,
          maxStates: options.maxStates,
          threads: options.threads,
          heuristic: options.heuristic,
          check: options.check,
          analytics: options.analytics,
        }),
      );
    },
  );

  return server;
}

export class EditorMcpServer {
  constructor({ projectService, isRendererDirty = () => false, auditLogPath = null }) {
    this.projectService = projectService;
    this.isRendererDirty = isRendererDirty;
    this.audit = new McpAuditLog(auditLogPath);
    this.clients = new Map();
    this.httpServer = null;
    this.token = null;
    this.port = null;
  }

  status() {
    const enabled = Boolean(this.httpServer && this.token && this.port);
    const endpoint = enabled ? `http://${HOST}:${this.port}${MCP_PATH}` : null;
    return {
      enabled,
      endpoint,
      token: enabled ? this.token : null,
      transport: "streamable-http",
      config: enabled
        ? {
            mcpServers: {
              "blackbox-editor": {
                type: "streamable-http",
                url: endpoint,
                headers: { Authorization: `Bearer ${this.token}` },
              },
            },
          }
        : null,
    };
  }

  async start() {
    if (this.httpServer) return this.status();
    this.token = randomBytes(24).toString("base64url");
    this.httpServer = http.createServer((request, response) => {
      void this.handleRequest(request, response);
    });
    await new Promise((resolve, reject) => {
      this.httpServer.once("error", reject);
      this.httpServer.listen(0, HOST, resolve);
    });
    const address = this.httpServer.address();
    this.port = typeof address === "object" && address ? address.port : null;
    console.log(`[editor] MCP server listening on ${this.status().endpoint}`);
    await this.audit.append({ type: "service", operation: "enabled", outcome: "success" });
    return this.status();
  }

  async stop() {
    const server = this.httpServer;
    this.httpServer = null;
    this.port = null;
    this.token = null;
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()));
    }
    if (server) {
      await this.audit.append({ type: "service", operation: "disabled", outcome: "success" });
    }
    return this.status();
  }

  clientFor(request, body) {
    const userAgent =
      typeof request.headers["user-agent"] === "string"
        ? request.headers["user-agent"].slice(0, 160)
        : null;
    const remoteAddress = request.socket.remoteAddress ?? "local";
    const key = `${remoteAddress}\0${userAgent ?? ""}`;
    const message = Array.isArray(body)
      ? body.find((entry) => entry?.method === "initialize")
      : body;
    const clientInfo = message?.method === "initialize" ? message.params?.clientInfo : null;
    if (clientInfo && typeof clientInfo === "object") {
      this.clients.set(key, {
        name: typeof clientInfo.name === "string" ? clientInfo.name.slice(0, 80) : "Unknown client",
        version: typeof clientInfo.version === "string" ? clientInfo.version.slice(0, 40) : null,
        userAgent,
      });
    }
    return this.clients.get(key) ?? { name: userAgent ?? "Unknown local client", version: null };
  }

  readAudit(limit) {
    return this.audit.read(limit);
  }

  async handleRequest(request, response) {
    try {
      const host = request.headers.host?.split(":")[0];
      if (host !== HOST && host !== "localhost") {
        return sendJson(response, 403, { error: "Invalid Host header" });
      }
      if (request.headers.origin) {
        return sendJson(response, 403, { error: "Browser origins are not allowed" });
      }
      if (!tokenMatches(request.headers.authorization, this.token)) {
        return sendJson(
          response,
          401,
          { error: "Missing or invalid bearer token" },
          { "www-authenticate": "Bearer" },
        );
      }
      const url = new URL(request.url ?? "/", `http://${HOST}`);
      if (url.pathname !== MCP_PATH) {
        return sendJson(response, 404, { error: "Not found" });
      }
      if (request.method !== "POST") {
        return sendJson(response, 405, { error: "Method not allowed" }, { allow: "POST" });
      }

      const body = await readJsonBody(request);
      const client = this.clientFor(request, body);
      const protocolServer = createProtocolServer({
        projectService: this.projectService,
        isRendererDirty: this.isRendererDirty,
        auditTool: (entry) => this.audit.append(entry),
        client,
      });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await protocolServer.connect(transport);
      response.on("close", () => {
        void transport.close();
        void protocolServer.close();
      });
      await transport.handleRequest(request, response, body);
    } catch (error) {
      console.error("[editor] MCP request failed:", error);
      if (!response.headersSent) {
        sendJson(response, error?.statusCode ?? 500, {
          jsonrpc: "2.0",
          error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
          id: null,
        });
      } else {
        response.end();
      }
    }
  }
}
