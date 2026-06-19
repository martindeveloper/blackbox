import assert from "node:assert/strict";
import test from "node:test";
import { runStageLifecycle } from "./lifecycle.mjs";
import { stagePackage } from "./stagePackage.mjs";

test("stage lifecycle runs before, execute, and after in order", async () => {
  const calls = [];
  const platform = {
    name: "test",
    async beforeBuild(ctx) {
      calls.push("before");
      ctx.marker = "prepared";
    },
    async executeBuild(ctx) {
      calls.push(`execute:${ctx.marker}`);
      return "/artifact/original";
    },
    async afterBuild(ctx) {
      calls.push(`after:${ctx.artifact}`);
      return "/artifact/final";
    },
  };

  const artifact = await runStageLifecycle({
    stage: "build",
    platform,
    project: { gameId: "example" },
    options: { skipPreflight: true },
  });

  assert.deepEqual(calls, [
    "before",
    "execute:prepared",
    "after:/artifact/original",
  ]);
  assert.equal(artifact, "/artifact/final");
});

test("stage lifecycle rejects platforms without an execute hook", async () => {
  await assert.rejects(
    runStageLifecycle({
      stage: "bundle",
      platform: { name: "test" },
      project: {},
      options: { skipPreflight: true },
    }),
    /does not implement stage "bundle"/,
  );
});

test("standalone package composes bundle and build, then passes explicit artifacts", async () => {
  const calls = [];
  const platform = {
    name: "test",
    executeBundle() {
      calls.push("bundle");
      return "/artifact/bundle";
    },
    executeBuild({ options }) {
      calls.push(`build:${options.bundleInput}`);
      return "/artifact/build";
    },
    executePackage({ options }) {
      calls.push(`package:${options.buildInput}:${options.bundleInput}`);
      return "/artifact/package";
    },
  };

  const artifact = await stagePackage(platform, {}, { skipPreflight: true });
  assert.equal(artifact, "/artifact/package");
  assert.deepEqual(calls, [
    "bundle",
    "build:/artifact/bundle",
    "package:/artifact/build:/artifact/bundle",
  ]);
});

test("pipeline package consumes explicit artifacts without recomposing", async () => {
  const calls = [];
  const platform = {
    name: "test",
    executePackage({ options }) {
      calls.push(options);
      return "/artifact/package";
    },
  };

  await stagePackage(platform, {}, {
    skipPreflight: true,
    buildInput: "/artifact/build",
    bundleInput: "/artifact/bundle",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].buildInput, "/artifact/build");
  assert.equal(calls[0].bundleInput, "/artifact/bundle");
});
