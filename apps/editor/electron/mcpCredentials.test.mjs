import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { McpCredentialStore } from "./mcpCredentials.mjs";

function fakeSafeStorage() {
  return {
    isAsyncEncryptionAvailable: async () => true,
    getSelectedStorageBackend: () => "gnome_libsecret",
    encryptStringAsync: async (value) => Buffer.from(`encrypted:${value}`),
    decryptStringAsync: async (value) => ({
      result: value.toString("utf8").slice("encrypted:".length),
      shouldReEncrypt: false,
    }),
  };
}

test("MCP credentials persist and are reused", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-mcp-credentials-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new McpCredentialStore({
    filePath: path.join(root, "mcp-token.bin"),
    safeStorage: fakeSafeStorage(),
  });

  const first = await store.getOrCreate();
  const second = await store.getOrCreate();

  assert.equal(second, first);
  assert.equal(first.length, 32);
});

test("regenerating MCP credentials replaces the persisted token", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-mcp-credentials-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new McpCredentialStore({
    filePath: path.join(root, "mcp-token.bin"),
    safeStorage: fakeSafeStorage(),
  });

  const first = await store.getOrCreate();
  const replacement = await store.regenerate();

  assert.notEqual(replacement, first);
  assert.equal(await store.getOrCreate(), replacement);
});

test("MCP credentials reject Electron's insecure Linux fallback", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-mcp-credentials-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const safeStorage = fakeSafeStorage();
  safeStorage.getSelectedStorageBackend = () => "basic_text";
  const store = new McpCredentialStore({
    filePath: path.join(root, "mcp-token.bin"),
    safeStorage,
    platform: "linux",
  });

  await assert.rejects(() => store.getOrCreate(), /secure Linux keyring/);
});
