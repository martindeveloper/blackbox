import fs from "node:fs/promises";
import path from "node:path";

const MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export class McpAuditLog {
  constructor(filePath) {
    this.filePath = filePath;
    this.pending = Promise.resolve();
  }

  append(entry) {
    if (!this.filePath) return Promise.resolve();
    const line = `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`;
    this.pending = this.pending
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        const stat = await fs.stat(this.filePath).catch(() => null);
        if (stat?.size >= MAX_BYTES) {
          await fs.rm(`${this.filePath}.old`, { force: true });
          await fs.rename(this.filePath, `${this.filePath}.old`);
        }
        await fs.appendFile(this.filePath, line);
      })
      .catch((error) => console.error("[editor] Failed to write MCP audit log:", error));
    return this.pending;
  }

  async read(limit = DEFAULT_LIMIT) {
    await this.pending;
    if (!this.filePath) return { entries: [], path: null };
    const count = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(limit) || DEFAULT_LIMIT)));
    const text = await fs.readFile(this.filePath, "utf8").catch(() => "");
    const entries = [];
    for (const line of text.trim().split("\n").slice(-count).reverse()) {
      try {
        entries.push(JSON.parse(line));
      } catch {}
    }
    return { entries, path: this.filePath };
  }
}
