import { isValidMcpPort, MAX_MCP_PORT, MIN_MCP_PORT } from "../shared/mcpConfig.js";

export class McpHost {
  constructor({ server, credentials, readPrefs, writePrefs }) {
    this.server = server;
    this.credentials = credentials;
    this.readPrefs = readPrefs;
    this.writePrefs = writePrefs;
    this.error = null;
  }

  async initialize() {
    const prefs = await this.readPrefs();
    if (!prefs.mcpEnabled) return this.status(prefs);
    try {
      await this.start(prefs.mcpPort);
    } catch (error) {
      this.error = errorMessage(error);
      console.error("[editor] Failed to start MCP server:", error);
    }
    return this.status(prefs);
  }

  async status(prefs = null) {
    const currentPrefs = prefs ?? (await this.readPrefs());
    return {
      ...(await this.server.status()),
      port: currentPrefs.mcpPort,
      error: this.error,
    };
  }

  async setEnabled(enabled) {
    if (typeof enabled !== "boolean") throw new TypeError("enabled must be a boolean");
    const prefs = await this.readPrefs();
    if (enabled) await this.start(prefs.mcpPort);
    else await this.server.stop();
    await this.writePrefs({ ...prefs, mcpEnabled: enabled });
    this.error = null;
    return this.status({ ...prefs, mcpEnabled: enabled });
  }

  async setPort(port) {
    validatePort(port);
    const prefs = await this.readPrefs();
    if (port === prefs.mcpPort) return this.status(prefs);

    const current = await this.server.status();
    if (current.enabled) {
      const token = current.token;
      await this.server.stop();
      try {
        await this.server.start({ token, port });
      } catch (error) {
        try {
          await this.server.start({ token, port: prefs.mcpPort });
        } catch (rollbackError) {
          this.error = `Could not restore MCP on port ${prefs.mcpPort}: ${errorMessage(rollbackError)}`;
        }
        throw error;
      }
    }

    const nextPrefs = { ...prefs, mcpPort: port };
    await this.writePrefs(nextPrefs);
    this.error = null;
    return this.status(nextPrefs);
  }

  async regenerateToken() {
    if (!(await this.server.status()).enabled) {
      throw new Error("Enable the MCP server before regenerating its token");
    }
    const token = await this.credentials.regenerate();
    await this.server.replaceToken(token);
    this.error = null;
    return this.status();
  }

  readAudit(limit) {
    return this.server.readAudit(limit);
  }

  async start(port) {
    const token = await this.credentials.getOrCreate();
    await this.server.start({ token, port });
  }
}

export function validatePort(port) {
  if (!isValidMcpPort(port)) {
    throw new RangeError(`MCP port must be an integer between ${MIN_MCP_PORT} and ${MAX_MCP_PORT}`);
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
