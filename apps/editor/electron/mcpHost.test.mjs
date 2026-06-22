import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MCP_PORT } from "../shared/mcpConfig.js";
import { McpHost, validatePort } from "./mcpHost.mjs";

function fixture({ enabled = false, port = DEFAULT_MCP_PORT, failPorts = [] } = {}) {
  let prefs = { mcpEnabled: enabled, mcpPort: port };
  let token = null;
  let activePort = null;
  const starts = [];
  const server = {
    status: () => ({
      enabled: activePort !== null,
      port: activePort,
      endpoint: activePort === null ? null : `http://127.0.0.1:${activePort}/mcp`,
      token,
      transport: "streamable-http",
      config: null,
    }),
    start: async (options) => {
      starts.push(options);
      if (failPorts.includes(options.port)) throw new Error(`Port ${options.port} is unavailable`);
      token = options.token;
      activePort = options.port;
    },
    stop: async () => {
      activePort = null;
      token = null;
    },
    replaceToken: async (replacement) => {
      token = replacement;
    },
    readAudit: async () => ({ entries: [], path: null }),
  };
  const host = new McpHost({
    server,
    credentials: {
      getOrCreate: async () => "persisted-token-that-is-long-enough",
      regenerate: async () => "replacement-token-that-is-long-enough",
    },
    readPrefs: async () => prefs,
    writePrefs: async (next) => {
      prefs = next;
    },
  });
  return { host, server, starts, prefs: () => prefs };
}

test("MCP host starts enabled service with persisted token and configured port", async () => {
  const { host, starts } = fixture({ enabled: true, port: 49100 });
  const status = await host.initialize();

  assert.deepEqual(starts, [{ token: "persisted-token-that-is-long-enough", port: 49100 }]);
  assert.equal(status.enabled, true);
  assert.equal(status.port, 49100);
});

test("MCP host persists port changes and restarts the running service", async () => {
  const { host, starts, prefs } = fixture({ enabled: true });
  await host.initialize();
  const status = await host.setPort(49101);

  assert.equal(starts.length, 2);
  assert.equal(starts[1].port, 49101);
  assert.equal(starts[1].token, "persisted-token-that-is-long-enough");
  assert.equal(prefs().mcpPort, 49101);
  assert.equal(status.port, 49101);
});

test("MCP host regenerates the active token", async () => {
  const { host } = fixture({ enabled: true });
  await host.initialize();
  const status = await host.regenerateToken();

  assert.equal(status.token, "replacement-token-that-is-long-enough");
});

test("MCP host restores the previous port when a live port change fails", async () => {
  const { host, starts, prefs } = fixture({ enabled: true, failPorts: [49101] });
  await host.initialize();

  await assert.rejects(() => host.setPort(49101), /unavailable/);

  assert.deepEqual(
    starts.map((start) => start.port),
    [DEFAULT_MCP_PORT, 49101, DEFAULT_MCP_PORT],
  );
  assert.equal(prefs().mcpPort, DEFAULT_MCP_PORT);
  assert.equal((await host.status()).enabled, true);
});

test("MCP port validation rejects privileged and invalid ports", () => {
  assert.throws(() => validatePort(80), RangeError);
  assert.throws(() => validatePort(65536), RangeError);
  assert.throws(() => validatePort(DEFAULT_MCP_PORT + 0.5), RangeError);
  assert.doesNotThrow(() => validatePort(DEFAULT_MCP_PORT));
});
