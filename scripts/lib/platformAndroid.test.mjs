import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { resolvePlatformConfig, resolveProject } from "./adventure.mjs";
import {
  applyAndroidSdkSettings,
  resolveAndroidSdk,
  validateAndroidSdkConfig,
} from "./platformAndroid.mjs";

test("resolveAndroidSdk defaults to Capacitor 8 levels", () => {
  assert.deepEqual(resolveAndroidSdk({}), {
    minSdk: 24,
    compileSdk: 36,
    targetSdk: 36,
  });
  assert.deepEqual(resolveAndroidSdk({ minSdk: 26, targetSdk: 36 }), {
    minSdk: 26,
    compileSdk: 36,
    targetSdk: 36,
  });
});

test("validateAndroidSdkConfig rejects invalid SDK combinations and floors", () => {
  const checks = validateAndroidSdkConfig({ minSdk: 20, targetSdk: 36, compileSdk: 36 });
  assert.ok(checks.some((check) => check.message.includes("minSdk")));

  const lowCompile = validateAndroidSdkConfig({ compileSdk: 35 });
  assert.ok(lowCompile.some((check) => check.message.includes("compileSdk")));

  const lowTarget = validateAndroidSdkConfig({ targetSdk: 35 });
  assert.ok(lowTarget.some((check) => check.message.includes("targetSdk")));

  const inconsistent = validateAndroidSdkConfig({ minSdk: 30, targetSdk: 28, compileSdk: 36 });
  assert.ok(inconsistent.some((check) => check.message.includes("targetSdk")));
});

test("resolvePlatformConfig threads SDK overrides from scenario.json", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bb-sdk-config-"));
  await writeFile(
    path.join(root, "scenario.json"),
    JSON.stringify({
      spec: "com.blackbox.scenario",
      title: "SDK Test",
      platforms: {
        ios: { deploymentTarget: "17.0" },
        android: { minSdk: 26, compileSdk: 36, targetSdk: 36 },
      },
    }),
  );
  const project = resolveProject(root);
  const ios = resolvePlatformConfig(project, "ios");
  const android = resolvePlatformConfig(project, "android");
  assert.equal(ios.deploymentTarget, "17.0");
  assert.equal(android.minSdk, 26);
  assert.equal(android.compileSdk, 36);
  assert.equal(android.targetSdk, 36);
});

test("applyAndroidSdkSettings patches variables.gradle", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bb-android-apply-"));
  await writeFile(
    path.join(root, "variables.gradle"),
    `ext {
    minSdkVersion = 24
    compileSdkVersion = 36
    targetSdkVersion = 36
}
`,
  );

  applyAndroidSdkSettings({
    androidRoot: root,
    config: { minSdk: 26, compileSdk: 36, targetSdk: 36 },
  });

  const updated = readFileSync(path.join(root, "variables.gradle"), "utf8");
  assert.match(updated, /minSdkVersion = 26/);
  assert.match(updated, /compileSdkVersion = 36/);
  assert.match(updated, /targetSdkVersion = 36/);
});
