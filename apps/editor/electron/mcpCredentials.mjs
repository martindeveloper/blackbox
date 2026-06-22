import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export class McpCredentialStore {
  constructor({ filePath, safeStorage, platform = process.platform }) {
    this.filePath = filePath;
    this.safeStorage = safeStorage;
    this.platform = platform;
  }

  async getOrCreate() {
    const existing = await this.read();
    return existing ?? this.regenerate();
  }

  async regenerate() {
    const token = randomBytes(24).toString("base64url");
    await this.write(token);
    return token;
  }

  async read() {
    const encrypted = await fs.readFile(this.filePath).catch(() => null);
    if (!encrypted?.length) return null;
    try {
      const { result, shouldReEncrypt } = await this.safeStorage.decryptStringAsync(encrypted);
      if (typeof result !== "string" || result.length < 24) return null;
      if (shouldReEncrypt) await this.write(result);
      return result;
    } catch (error) {
      console.warn("[editor] Stored MCP credential could not be decrypted; replacing it:", error);
      return null;
    }
  }

  async write(token) {
    if (!(await this.safeStorage.isAsyncEncryptionAvailable())) {
      throw new Error("Secure credential storage is unavailable on this system");
    }
    if (
      this.platform === "linux" &&
      this.safeStorage.getSelectedStorageBackend() === "basic_text"
    ) {
      throw new Error("A secure Linux keyring is required to store the MCP token");
    }
    const encrypted = await this.safeStorage.encryptStringAsync(token);
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, encrypted, { mode: 0o600 });
    await fs.chmod(this.filePath, 0o600).catch(() => {});
  }
}
