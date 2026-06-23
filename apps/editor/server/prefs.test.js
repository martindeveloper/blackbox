import assert from "node:assert/strict";
import test from "node:test";
import { CUSTOM_IDE_ID, DEFAULT_IDE_ID } from "../shared/ideRegistry.js";
import { DEFAULT_MCP_PORT } from "../shared/mcpConfig.js";
import { DEFAULT_USER_PREFS, sanitizePrefs } from "./prefs.js";

test("user preferences default theme and preferred IDE", () => {
  assert.deepEqual(DEFAULT_USER_PREFS, {
    theme: "device",
    preferredIde: DEFAULT_IDE_ID,
    mcpEnabled: false,
    mcpPort: DEFAULT_MCP_PORT,
    searchFullTextDefault: false,
    saveAndSyncDefault: false,
    askSyncDescription: false,
    vcsChecksEnabled: false,
    vcsCheckIntervalMinutes: 5,
  });
  assert.deepEqual(sanitizePrefs({ theme: "dark", preferredIde: DEFAULT_IDE_ID }), {
    theme: "dark",
    preferredIde: DEFAULT_IDE_ID,
  });
  assert.deepEqual(
    sanitizePrefs({
      preferredIde: CUSTOM_IDE_ID,
      customIdePath: " /usr/local/bin/code ",
    }),
    { preferredIde: CUSTOM_IDE_ID, customIdePath: "/usr/local/bin/code" },
  );
  assert.deepEqual(sanitizePrefs({ theme: "invalid", preferredIde: "unknown-ide" }), {});
  assert.deepEqual(sanitizePrefs({ mcpEnabled: true }), { mcpEnabled: true });
  assert.deepEqual(sanitizePrefs({ mcpPort: 47832 }), { mcpPort: 47832 });
  assert.deepEqual(sanitizePrefs({ mcpPort: 80 }), {});
  assert.deepEqual(sanitizePrefs({ mcpPort: 70000 }), {});
  assert.deepEqual(sanitizePrefs({ searchFullTextDefault: true }), {
    searchFullTextDefault: true,
  });
  assert.deepEqual(sanitizePrefs({ saveAndSyncDefault: true }), {
    saveAndSyncDefault: true,
  });
  assert.deepEqual(sanitizePrefs({ askSyncDescription: true }), {
    askSyncDescription: true,
  });
  assert.deepEqual(sanitizePrefs({ vcsChecksEnabled: true }), {
    vcsChecksEnabled: true,
  });
  assert.deepEqual(sanitizePrefs({ vcsCheckIntervalMinutes: 10.7 }), {
    vcsCheckIntervalMinutes: 11,
  });
  assert.deepEqual(sanitizePrefs({ vcsCheckIntervalMinutes: 0 }), {
    vcsCheckIntervalMinutes: 1,
  });
});
