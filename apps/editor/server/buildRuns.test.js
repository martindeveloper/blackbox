import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { BuildRunRegistry } from "./pipeline/buildRuns.js";
import { stagesForPlatform } from "../shared/buildStages.js";
import { isStageAllowed } from "./pipeline/cli.js";
import { BUILD_RUNS_PATH } from "../shared/blackboxPaths.js";

async function tempProject() {
  return mkdtemp(path.join(tmpdir(), "bb-build-runs-"));
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

function fakeSpawn(results = {}) {
  const calls = [];
  const options = [];
  const spawn = (root, opts, onLine) => {
    calls.push(opts.stage);
    options.push(opts);
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
  return { spawn, calls, options };
}

async function waitForSettled(registry, root) {
  for (let i = 0; i < 200; i += 1) {
    const current = await registry.getCurrent(root);
    if (current && current.run.state !== "running") {
      await registry.flush(root);
      return current;
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("build run did not settle");
}

test("stage helpers: package is offered on every platform", () => {
  assert.deepEqual(stagesForPlatform("web"), ["bundle", "build", "package"]);
  assert.deepEqual(stagesForPlatform("ios"), ["bundle", "build", "package"]);
  assert.deepEqual(stagesForPlatform("android"), ["bundle", "build", "package"]);
  assert.equal(isStageAllowed("package", "web"), true);
  assert.equal(isStageAllowed("package", "ios"), true);
  assert.equal(isStageAllowed("package", "android"), true);
});

test("runs selected stages in canonical order to completion", async () => {
  const root = await tempProject();
  try {
    const { spawn, calls, options } = fakeSpawn();
    const registry = new BuildRunRegistry({ spawn });
    await registry.start(root, {
      platform: "web",
      configuration: "release",
      stages: ["package", "build", "bundle"],
    });
    const current = await waitForSettled(registry, root);
    assert.equal(current.run.state, "done");
    assert.deepEqual(calls, ["bundle", "build", "package"]);
    assert.equal(options[0].reusePriorStages, false);
    assert.equal(options[1].reusePriorStages, true);
    assert.equal(options[2].reusePriorStages, true);
    assert.equal(current.run.artifact, "/artifact/package");
    assert.ok(current.run.stages.every((s) => s.state === "done"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("build-only runs remain independent and do not request bundle reuse", async () => {
  const root = await tempProject();
  try {
    const { spawn, options } = fakeSpawn();
    const registry = new BuildRunRegistry({ spawn });
    await registry.start(root, {
      platform: "ios",
      configuration: "debug",
      stages: ["build"],
    });
    await waitForSettled(registry, root);
    assert.equal(options.length, 1);
    assert.equal(options[0].stage, "build");
    assert.equal(options[0].reusePriorStages, false);
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
    assert.deepEqual(calls, ["bundle"]); // build and package never ran
    const states = Object.fromEntries(current.run.stages.map((s) => [s.stage, s.state]));
    assert.deepEqual(states, { bundle: "error", build: "pending", package: "pending" });
    assert.match(current.run.error, /bundle/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("packages mobile platforms too (bundle, build, package)", async () => {
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
    assert.deepEqual(calls, ["bundle", "build", "package"]);
    assert.deepEqual(
      current.run.stages.map((s) => s.stage),
      ["bundle", "build", "package"],
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

test("persists per-stage logs in build-runs.json", async () => {
  const root = await tempProject();
  try {
    const { spawn } = fakeSpawn();
    const registry = new BuildRunRegistry({ spawn });
    await registry.start(root, {
      platform: "web",
      configuration: "release",
      stages: ["bundle", "build"],
    });
    const current = await waitForSettled(registry, root);
    assert.deepEqual(
      current.run.stages.map((stage) => stage.log),
      [["running bundle"], ["running build"]],
    );
    assert.deepEqual(current.log, ["running bundle", "running build"]);

    const stored = JSON.parse(await readFile(path.join(root, BUILD_RUNS_PATH), "utf8"));
    assert.equal(stored.version, 2);
    assert.deepEqual(
      stored.run.stages.map((stage) => stage.log),
      [["running bundle"], ["running build"]],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loads v1 build runs without stage logs", async () => {
  const root = await tempProject();
  try {
    const file = path.join(root, BUILD_RUNS_PATH);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        run: {
          id: "legacy",
          platform: "web",
          configuration: "release",
          state: "done",
          startedAt: Date.now() - 1000,
          completedAt: Date.now(),
          stages: [{ stage: "build", state: "done", artifact: "/artifact/build" }],
          artifact: "/artifact/build",
          error: null,
        },
      }),
    );
    const registry = new BuildRunRegistry();
    const current = await registry.getCurrent(root);
    assert.deepEqual(current.run.stages[0].log, []);
    assert.deepEqual(current.log, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("clear drops the stored run and log", async () => {
  const root = await tempProject();
  try {
    const { spawn } = fakeSpawn();
    const registry = new BuildRunRegistry({ spawn });
    await registry.start(root, { platform: "web", configuration: "release", stages: ["build"] });
    await waitForSettled(registry, root);
    assert.ok(await registry.getCurrent(root));

    const cleared = await registry.clear(root);
    assert.equal(cleared, true);
    assert.equal(await registry.getCurrent(root), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("clear refuses while a build is running", async () => {
  const root = await tempProject();
  try {
    const gate = deferred();
    const spawn = () => ({
      done: gate.promise.then(() => ({ exitCode: 0, canceled: false, artifact: "/x" })),
      cancel() {},
    });
    const registry = new BuildRunRegistry({ spawn });
    await registry.start(root, { platform: "web", configuration: "release", stages: ["build"] });
    const cleared = await registry.clear(root);
    assert.equal(cleared, false);
    gate.resolve();
    await waitForSettled(registry, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
