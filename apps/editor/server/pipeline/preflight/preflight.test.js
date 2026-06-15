import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { detectBuildCapabilities } from "./index.js";
import { createHostCache } from "./helpers.js";

test("detectBuildCapabilities exposes stage hooks for every platform", () => {
  const caps = detectBuildCapabilities();

  for (const platform of ["web", "ios", "android"]) {
    for (const stage of ["bundle", "build", "package"]) {
      const entry = caps[platform].stages[stage];
      assert.ok(entry, `${platform}.${stage} should exist`);
      assert.equal(typeof entry.available, "boolean");
      assert.ok(Array.isArray(entry.checks));
      for (const check of entry.checks) {
        assert.ok(check.severity === "error" || check.severity === "warning");
        assert.equal(typeof check.message, "string");
      }
    }
  }
});

test("host cache reuses command and ffmpeg probe results within one request", () => {
  const host = createHostCache();
  assert.equal(host.commandExists("ffmpeg"), host.commandExists("ffmpeg"));
  assert.equal(host.ffmpegEncoders(), host.ffmpegEncoders());
});

test("android package preflight reads keystore settings from scenario.json", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bb-preflight-"));
  await writeFile(
    path.join(root, "scenario.json"),
    JSON.stringify({
      spec: "com.blackbox.scenario",
      title: "Test",
      platforms: {
        android: {
          keystore: {
            path: "missing.keystore",
            storePassword: "secret",
            keyPassword: "secret",
          },
        },
      },
    }),
  );

  const caps = detectBuildCapabilities(root);
  const packageChecks = caps.android.stages.package.checks.map((check) => check.message);
  assert.ok(
    packageChecks.some((message) => message.includes("release keystore not found")),
    packageChecks,
  );
  assert.equal(caps.android.stages.package.available, false);
});

test("ios package preflight reports missing signing team from scenario.json", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bb-preflight-"));
  await writeFile(
    path.join(root, "scenario.json"),
    JSON.stringify({
      spec: "com.blackbox.scenario",
      title: "Test",
      platforms: {
        ios: {
          signing: {},
        },
      },
    }),
  );

  const previousTeam = process.env.APPLE_TEAM_ID;
  delete process.env.APPLE_TEAM_ID;
  try {
    const caps = detectBuildCapabilities(root);
    const packageChecks = caps.ios.stages.package.checks.map((check) => check.message);
    assert.ok(
      packageChecks.some((message) => message.includes("missing signing team")),
      packageChecks,
    );
    assert.equal(caps.ios.stages.package.available, false);
  } finally {
    if (previousTeam === undefined) delete process.env.APPLE_TEAM_ID;
    else process.env.APPLE_TEAM_ID = previousTeam;
  }
});
