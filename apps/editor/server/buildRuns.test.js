import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { BuildRunRegistry } from "./pipeline/buildRuns.js";
import { isStageAllowed, stagesForPlatform } from "./pipeline/cli.js";
import { BUILD_RUNS_PATH } from "../shared/blackboxPaths.js";

async function tempProject() {
  return mkdtemp(path.join(tmpdir(), "bb-build-runs-"));
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

/** Fake spawner: each stage resolves with the queued result (default success). */
function fakeSpawn(results = {}) {
  const calls = [];
  const spawn = (root, opts, onLine) => {
    calls.push(opts.stage);
    onLine(`running ${opts.stage}`);
    const result = results[opts.stage] ?? { exitCode: 0 };
    return {
      done: Promise.resolve({
        exitCode: result.exitCode ?? 0,
        canceled: false,
        artifact: result.exitCode === 0 ? `/artifact/${opts.stage}` : null,
      }),
      cancel() {},
    };
  };
  return { spawn, calls };
}

async function waitForSettled(registry, root) {
  for (let i = 0; i < 200; i += 1) {
    const current = await registry.getCurrent(root);
    if (current && current.run.state !== "running") return current;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("build run did not settle");
}

test("stage helpers: package is offered on every platform", () => {
  assert.deepEqual(stagesForPlatform("web"), ["build", "bundle", "package"]);
  assert.deepEqual(stagesForPlatform("ios"), ["build", "bundle", "package"]);
  assert.deepEqual(stagesForPlatform("android"), ["build", "bundle", "package"]);
  assert.equal(isStageAllowed("package", "web"), true);
  assert.equal(isStageAllowed("package", "ios"), true);
  assert.equal(isStageAllowed("package", "android"), true);
});

test("runs selected stages in canonical order to completion", async () => {
  const root = await tempProject();
  try {
    const { spawn, calls } = fakeSpawn();
    const registry = new BuildRunRegistry({ spawn });
    await registry.start(root, {
      platform: "web",
      configuration: "release",
      stages: ["package", "build", "bundle"],
    });
    const current = await waitForSettled(registry, root);
    assert.equal(current.run.state, "done");
    assert.deepEqual(calls, ["build", "bundle", "package"]);
    assert.equal(current.run.artifact, "/artifact/package");
    assert.ok(current.run.stages.every((s) => s.state === "done"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stops on stage failure and leaves later stages pending", async () => {
  const root = await tempProject();
  try {
    const { spawn, calls } = fakeSpawn({ bundle: { exitCode: 2 } });
    const registry = new BuildRunRegistry({ spawn });
    await registry.start(root, {
      platform: "web",
      configuration: "release",
      stages: ["build", "bundle", "package"],
    });
    const current = await waitForSettled(registry, root);
    assert.equal(current.run.state, "error");
    assert.deepEqual(calls, ["build", "bundle"]); // package never ran
    const states = Object.fromEntries(current.run.stages.map((s) => [s.stage, s.state]));
    assert.deepEqual(states, { build: "done", bundle: "error", package: "pending" });
    assert.match(current.run.error, /bundle/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("packages mobile platforms too (build, bundle, package)", async () => {
  const root = await tempProject();
  try {
    const { spawn, calls } = fakeSpawn();
    const registry = new BuildRunRegistry({ spawn });
    await registry.start(root, {
      platform: "android",
      configuration: "debug",
      stages: ["build", "bundle", "package"],
    });
    const current = await waitForSettled(registry, root);
    assert.deepEqual(calls, ["build", "bundle", "package"]);
    assert.deepEqual(
      current.run.stages.map((s) => s.stage),
      ["build", "bundle", "package"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cancel stops the run", async () => {
  const root = await tempProject();
  try {
    const gate = deferred();
    let canceledFlag = false;
    const spawn = (rootArg, opts, onLine) => {
      onLine(`running ${opts.stage}`);
      return {
        done: gate.promise.then(() => ({
          exitCode: -1,
          canceled: canceledFlag,
          artifact: null,
        })),
        cancel() {
          canceledFlag = true;
          gate.resolve();
        },
      };
    };
    const registry = new BuildRunRegistry({ spawn });
    const { run } = await registry.start(root, {
      platform: "web",
      configuration: "release",
      stages: ["build", "bundle"],
    });
    const canceled = await registry.cancel(root, run.id);
    assert.equal(canceled, true);
    const current = await waitForSettled(registry, root);
    assert.equal(current.run.state, "canceled");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recovers an interrupted run on load", async () => {
  const root = await tempProject();
  try {
    const file = path.join(root, BUILD_RUNS_PATH);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        run: {
          id: "abc",
          platform: "web",
          configuration: "release",
          state: "running",
          startedAt: Date.now() - 1000,
          completedAt: null,
          stages: [{ stage: "build", state: "running", artifact: null }],
          artifact: null,
          error: null,
        },
      }),
    );
    const registry = new BuildRunRegistry();
    const current = await registry.getCurrent(root);
    assert.equal(current.run.state, "error");
    assert.equal(current.run.stages[0].state, "error");
    assert.match(current.run.error, /interrupted/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses a second concurrent run", async () => {
  const root = await tempProject();
  try {
    const gate = deferred();
    const spawn = () => ({
      done: gate.promise.then(() => ({ exitCode: 0, canceled: false, artifact: "/x" })),
      cancel() {},
    });
    const registry = new BuildRunRegistry({ spawn });
    await registry.start(root, { platform: "web", configuration: "release", stages: ["build"] });
    const second = await registry.start(root, {
      platform: "web",
      configuration: "release",
      stages: ["build"],
    });
    assert.equal(second.alreadyRunning, true);
    gate.resolve();
    await waitForSettled(registry, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
