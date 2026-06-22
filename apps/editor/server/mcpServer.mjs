import { randomBytes } from "node:crypto";
import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpAuditLog } from "./mcpAuditLog.mjs";
import {
  HOST,
  MCP_PATH,
  MAX_BODY_BYTES,
  isUploadCall,
  readJsonBody,
  sendJson,
  tokenMatches,
} from "./mcpHelpers.mjs";
import { createProtocolServer } from "./mcpProtocol.mjs";

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

  async start({ token = randomBytes(24).toString("base64url"), port = 0 } = {}) {
    if (this.httpServer) return this.status();
    if (typeof token !== "string" || token.length < 24) {
      throw new TypeError("MCP bearer token is invalid");
    }
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new RangeError("MCP port must be an integer between 0 and 65535");
    }
    this.token = token;
    this.httpServer = http.createServer((request, response) => {
      void this.handleRequest(request, response);
    });
    try {
      await new Promise((resolve, reject) => {
        this.httpServer.once("error", reject);
        this.httpServer.listen(port, HOST, resolve);
      });
    } catch (error) {
      this.httpServer = null;
      this.token = null;
      throw error;
    }
    const address = this.httpServer.address();
    this.port = typeof address === "object" && address ? address.port : null;
    console.log(`[editor] MCP server listening on ${this.status().endpoint}`);
    await this.audit.append({ type: "service", operation: "enabled", outcome: "success" });
    return this.status();
  }

  async replaceToken(token) {
    if (!this.httpServer) throw new Error("The MCP server must be running to replace its token");
    if (typeof token !== "string" || token.length < 24) {
      throw new TypeError("MCP bearer token is invalid");
    }
    this.token = token;
    this.clients.clear();
    await this.audit.append({
      type: "service",
      operation: "token_regenerated",
      outcome: "success",
    });
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

      const { value: body, size } = await readJsonBody(request);
      if (size > MAX_BODY_BYTES && !isUploadCall(body)) {
        const error = new Error("MCP request body is too large");
        error.statusCode = 413;
        throw error;
      }
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
