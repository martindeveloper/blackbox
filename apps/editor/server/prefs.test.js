import assert from "node:assert/strict";
import test from "node:test";
import { CUSTOM_IDE_ID, DEFAULT_IDE_ID } from "../shared/ideRegistry.js";
import { DEFAULT_USER_PREFS, sanitizePrefs } from "./prefs.js";

test("user preferences default theme and preferred IDE", () => {
  assert.deepEqual(DEFAULT_USER_PREFS, {
    theme: "device",
    preferredIde: DEFAULT_IDE_ID,
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
});
