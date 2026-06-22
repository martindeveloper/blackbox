import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { BUILD_PLATFORMS, BUILD_STAGES } from "../buildStages.mjs";
import { resolveProject } from "../adventure.mjs";
import { sharedBundleChecks } from "./bundleCommon.mjs";
import {
  assertStageReady,
  createHostCache,
  detectBuildCapabilities,
} from "./index.mjs";

test("shared bundle checks identify installable media dependencies", async () => {
  const checks = await sharedBundleChecks({
    host: {
      commandExists: async () => false,
      ffmpegEncoders: async () => "",
    },
  });

  assert.deepEqual(
    checks.map(({ severity, dependency }) => ({ severity, dependency })),
    [
      { severity: "error", dependency: "ffmpeg" },
      { severity: "warning", dependency: "cwebp" },
    ],
  );
});

test("detectBuildCapabilities exposes stage hooks for every platform", async () => {
  const caps = await detectBuildCapabilities();

  for (const platform of BUILD_PLATFORMS) {
    for (const stage of BUILD_STAGES) {
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

test("host cache reuses command and ffmpeg probe results within one request", async () => {
  const host = createHostCache();
  const [first, second] = await Promise.all([
    host.commandExists("ffmpeg"),
    host.commandExists("ffmpeg"),
  ]);
  assert.equal(first, second);
  const [encodersA, encodersB] = await Promise.all([
    host.ffmpegEncoders(),
    host.ffmpegEncoders(),
  ]);
  assert.equal(encodersA, encodersB);
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

  const caps = await detectBuildCapabilities(root);
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
    const caps = await detectBuildCapabilities(root);
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

test("android build preflight rejects minSdk below the engine floor", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bb-preflight-sdk-"));
  await writeFile(
    path.join(root, "scenario.json"),
    JSON.stringify({
      spec: "com.blackbox.scenario",
      title: "Test",
      platforms: {
        android: { minSdk: 21 },
      },
    }),
  );

  const caps = await detectBuildCapabilities(root);
  const buildChecks = caps.android.stages.build.checks.map((check) => check.message);
  assert.ok(buildChecks.some((message) => message.includes("minSdk")), buildChecks);
  assert.equal(caps.android.stages.build.available, false);
});

test("ios build preflight rejects deploymentTarget below the engine floor", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bb-preflight-ios-sdk-"));
  await writeFile(
    path.join(root, "scenario.json"),
    JSON.stringify({
      spec: "com.blackbox.scenario",
      title: "Test",
      platforms: {
        ios: { deploymentTarget: "14.0" },
      },
    }),
  );

  const caps = await detectBuildCapabilities(root);
  const buildChecks = caps.ios.stages.build.checks.map((check) => check.message);
  assert.ok(buildChecks.some((message) => message.includes("deploymentTarget")), buildChecks);
  assert.equal(caps.ios.stages.build.available, false);
});

test("android build preflight rejects compileSdk below the engine floor", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bb-preflight-compile-sdk-"));
  await writeFile(
    path.join(root, "scenario.json"),
    JSON.stringify({
      spec: "com.blackbox.scenario",
      title: "Test",
      platforms: {
        android: { compileSdk: 35 },
      },
    }),
  );

  const caps = await detectBuildCapabilities(root);
  const buildChecks = caps.android.stages.build.checks.map((check) => check.message);
  assert.ok(buildChecks.some((message) => message.includes("compileSdk")), buildChecks);
  assert.equal(caps.android.stages.build.available, false);
});

test("assertStageReady throws the first package error for android", async () => {
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

  const project = resolveProject(root, { configuration: "release" });

  await assert.rejects(
    () => assertStageReady("android", "package", project),
    /release keystore not found/,
  );
});
