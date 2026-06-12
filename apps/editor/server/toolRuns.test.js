import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { TOOL_RUNS_PATH } from "../shared/blackboxPaths.js";
import { ToolRunRegistry } from "./toolRuns.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function registryFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-tool-runs-"));
  const projectRoot = path.join(root, "project");
  await fs.mkdir(projectRoot);
  return {
    root,
    projectRoot,
    registry: new ToolRunRegistry(),
    async close() {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

async function waitForCompletion(registry, projectRoot, tool) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const run = await registry.get(projectRoot, tool);
    if (run?.state !== "running") {
      await registry.flush(projectRoot);
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`Timed out waiting for ${tool}`);
}

test("keeps an in-flight tool run and its completed result", async () => {
  const env = await registryFixture();
  try {
    const pending = deferred();
    const first = await env.registry.start(
      env.projectRoot,
      "linter",
      { expectedRevision: 1 },
      () => pending.promise,
    );
    const duplicate = await env.registry.start(
      env.projectRoot,
      "linter",
      { expectedRevision: 2 },
      () => {
        throw new Error("must not start twice");
      },
    );

    assert.equal(first.state, "running");
    assert.equal(duplicate.id, first.id);
    assert.equal(duplicate.request.expectedRevision, 1);

    pending.resolve({
      ok: true,
      exitCode: 0,
      raw: { stdout: "done", stderr: "" },
      parsed: null,
    });
    await pending.promise;
    const completed = await waitForCompletion(env.registry, env.projectRoot, "linter");
    assert.equal(completed.state, "done");
    assert.equal(completed.result.raw.stdout, "done");
    assert.ok(completed.completedAt >= completed.startedAt);
  } finally {
    await env.close();
  }
});

test("records rejected tool runs as errors", async () => {
  const env = await registryFixture();
  try {
    await env.registry.start(env.projectRoot, "simulator", {}, async () => {
      throw new Error("simulation failed");
    });
    const completed = await waitForCompletion(env.registry, env.projectRoot, "simulator");
    assert.equal(completed.state, "error");
    assert.equal(completed.result.error, "simulation failed");
  } finally {
    await env.close();
  }
});

test("restores the latest completed run from disk", async () => {
  const env = await registryFixture();
  try {
    await env.registry.start(env.projectRoot, "bundle", { expectedRevision: 4 }, async () => ({
      ok: true,
      exitCode: 0,
      raw: { stdout: "packed", stderr: "" },
      parsed: null,
    }));
    await waitForCompletion(env.registry, env.projectRoot, "bundle");

    const restarted = new ToolRunRegistry();
    const restored = await restarted.get(env.projectRoot, "bundle");
    assert.equal(restored.state, "done");
    assert.equal(restored.request.expectedRevision, 4);
    assert.equal(restored.result.raw.stdout, "packed");
    await fs.access(path.join(env.projectRoot, TOOL_RUNS_PATH));
    await assert.rejects(fs.access(path.join(env.root, ".blackbox", "tool-runs", "latest.json")));
  } finally {
    await env.close();
  }
});

test("marks a persisted in-flight run as interrupted after restart", async () => {
  const env = await registryFixture();
  try {
    const pending = deferred();
    await env.registry.start(
      env.projectRoot,
      "linter",
      { expectedRevision: 7 },
      () => pending.promise,
    );

    const restarted = new ToolRunRegistry();
    const restored = await restarted.get(env.projectRoot, "linter");
    assert.equal(restored.state, "error");
    assert.match(restored.result.error, /interrupted/i);
    assert.ok(restored.completedAt >= restored.startedAt);

    pending.resolve({
      ok: true,
      exitCode: 0,
      raw: { stdout: "", stderr: "" },
      parsed: null,
    });
    await pending.promise;
    await settle();
    await env.registry.flush(env.projectRoot);
  } finally {
    await env.close();
  }
});
