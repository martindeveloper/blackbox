import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { BUILD_RUNS_PATH } from "../../shared/blackboxPaths.js";
import { appendLogLine } from "../../shared/logBuffer.js";
import { stagesForPlatform } from "../../shared/buildStages.js";
import { cleanBuildCaches, cleanBuildOutput, isStageAllowed, spawnStage } from "./cli.js";

const SCHEMA_VERSION = 2;

function createStage(stage) {
  return { stage, state: "pending", artifact: null, log: [] };
}

function combinedLog(stages) {
  return stages.flatMap((stage) => stage.log);
}

function stageSnapshot(stage) {
  return {
    stage: stage.stage,
    state: stage.state,
    artifact: stage.artifact ?? null,
    log: Array.isArray(stage.log) ? stage.log : [],
  };
}

function snapshot(record) {
  return {
    id: record.id,
    platform: record.platform,
    configuration: record.configuration,
    state: record.state,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    stages: record.stages.map(stageSnapshot),
    artifact: record.artifact,
    error: record.error,
  };
}

function isStoredRun(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.platform === "string" &&
    typeof value.configuration === "string" &&
    Array.isArray(value.stages) &&
    Number.isFinite(value.startedAt)
  );
}

export class BuildRunRegistry {
  // `spawn` is injectable so the state machine can be tested without launching the real CLI.
  constructor({ spawn = spawnStage } = {}) {
    this.projects = new Map();
    this.spawn = spawn;
  }

  filePath(projectRoot) {
    return path.join(projectRoot, BUILD_RUNS_PATH);
  }

  async load(projectRoot) {
    const root = path.resolve(projectRoot);
    const existing = this.projects.get(root);
    if (existing) {
      await existing.ready;
      return existing;
    }

    const project = {
      current: null,
      emitter: new EventEmitter(),
      controller: null,
      writeChain: Promise.resolve(),
      executing: null,
      ready: null,
    };
    project.emitter.setMaxListeners(0);
    this.projects.set(root, project);
    project.ready = (async () => {
      try {
        const stored = JSON.parse(await fs.readFile(this.filePath(root), "utf8"));
        if (
          (stored?.version === SCHEMA_VERSION || stored?.version === 1) &&
          isStoredRun(stored.run)
        ) {
          const run = stored.run;
          let upgraded = stored.version !== SCHEMA_VERSION;
          // A run still marked running means the editor stopped mid-build.
          if (run.state === "running") {
            run.state = "error";
            run.completedAt = run.completedAt ?? Date.now();
            run.error = "Build was interrupted when the editor stopped";
            for (const stage of run.stages) {
              if (stage.state === "running") stage.state = "error";
            }
            upgraded = true;
          }
          project.current = { ...run, stages: run.stages.map(stageSnapshot) };
          if (upgraded) await this.persist(root, project);
        }
      } catch (error) {
        if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      }
    })();
    await project.ready;
    return project;
  }

  async persist(projectRoot, project) {
    const run = project.current ? snapshot(project.current) : null;
    const contents = `${JSON.stringify({ version: SCHEMA_VERSION, run })}\n`;
    const target = this.filePath(projectRoot);
    const temporary = `${target}.tmp`;
    await fs.mkdir(path.dirname(target), { recursive: true });
    project.writeChain = project.writeChain
      .catch(() => {})
      .then(async () => {
        await fs.writeFile(temporary, contents);
        await fs.rename(temporary, target);
      });
    return project.writeChain;
  }

  emit(project, event) {
    project.emitter.emit("event", event);
  }

  appendStageLog(project, stageRecord, line) {
    appendLogLine(stageRecord.log, line);
    this.emit(project, { type: "log", line, stage: stageRecord.stage });
  }

  subscribe(projectRoot, listener) {
    const root = path.resolve(projectRoot);
    const project = this.projects.get(root);
    if (!project) return () => {};
    project.emitter.on("event", listener);
    return () => project.emitter.off("event", listener);
  }

  async getCurrent(projectRoot) {
    const project = await this.load(projectRoot);
    return project.current
      ? { run: snapshot(project.current), log: combinedLog(project.current.stages) }
      : null;
  }

  async start(
    projectRoot,
    { platform, configuration, stages, reactCompiler = true, clean = false },
  ) {
    const root = path.resolve(projectRoot);
    const project = await this.load(root);
    if (project.current?.state === "running") {
      return {
        run: snapshot(project.current),
        log: combinedLog(project.current.stages),
        alreadyRunning: true,
      };
    }

    const ordered = stagesForPlatform(platform).filter(
      (stage) => stages.includes(stage) && isStageAllowed(stage, platform),
    );

    const record = {
      id: randomUUID(),
      platform,
      configuration,
      // Build-time input (web/mobile player bundles only); not persisted in snapshots.
      reactCompiler,
      state: "running",
      startedAt: Date.now(),
      completedAt: null,
      stages: ordered.map((stage) => createStage(stage)),
      artifact: null,
      error: null,
    };
    project.current = record;
    await this.persist(root, project);
    this.emit(project, { type: "started", run: snapshot(record) });

    // Clean (delete prior output) runs inside execute() as the build's first step, not here, so
    // the request returns immediately and the recursive delete never blocks the event loop or
    // delays the "started" event. Guarded already by the running check above.
    project.executing = this.execute(root, project, record, { clean }).finally(() => {
      project.executing = null;
    });

    return { run: snapshot(record), log: [], alreadyRunning: false };
  }

  async execute(root, project, record, { clean = false } = {}) {
    // Fresh build: delete prior output before the first stage runs. Streamed as a log line on the
    // first stage so the UI shows exactly what was removed.
    if (clean && record.state === "running" && record.stages[0]) {
      const stage0 = record.stages[0];
      const { dir, removed } = await cleanBuildOutput(root, record.configuration);
      this.appendStageLog(
        project,
        stage0,
        removed.length > 0
          ? `[build] clean: removed ${dir} (${removed.join(", ")})`
          : `[build] clean: no existing build output at ${dir}`,
      );
      // Also clear this project's reusable build cache (bundler transcode + tailwind) so the
      // rebuild is genuinely fresh. Project-scoped, so other projects' caches are untouched.
      const cacheDir = await cleanBuildCaches(root);
      this.appendStageLog(
        project,
        stage0,
        cacheDir
          ? `[build] clean: removed cache ${cacheDir}`
          : "[build] clean: no build cache present",
      );
    }

    // Later stages can reuse outputs produced earlier in this same pipeline while every stage
    // remains independently runnable. Bundle precedes Build, so Build can embed that exact
    // platform bundle instead of invoking the bundler again. Package can reuse both.
    const selectedStages = new Set(record.stages.map((stageRecord) => stageRecord.stage));
    const buildCanReuseBundle = selectedStages.has("bundle");
    const packageCanReuse = selectedStages.has("build") && selectedStages.has("bundle");

    for (const stageRecord of record.stages) {
      if (record.state !== "running") break;
      stageRecord.state = "running";
      this.emit(project, { type: "stage", stage: stageRecord.stage, state: "running" });

      const handle = this.spawn(
        root,
        {
          platform: record.platform,
          configuration: record.configuration,
          stage: stageRecord.stage,
          reactCompiler: record.reactCompiler,
          reusePriorStages:
            (stageRecord.stage === "build" && buildCanReuseBundle) ||
            (stageRecord.stage === "package" && packageCanReuse),
        },
        (line) => this.appendStageLog(project, stageRecord, line),
      );
      project.controller = handle;
      const { exitCode, canceled, artifact } = await handle.done;
      project.controller = null;

      if (canceled) {
        stageRecord.state = "canceled";
        record.state = "canceled";
        this.emit(project, { type: "stage", stage: stageRecord.stage, state: "canceled" });
      } else if (exitCode !== 0) {
        stageRecord.state = "error";
        record.state = "error";
        record.error = `Stage "${stageRecord.stage}" exited with code ${exitCode}`;
        this.emit(project, { type: "stage", stage: stageRecord.stage, state: "error" });
      } else {
        stageRecord.state = "done";
        stageRecord.artifact = artifact;
        record.artifact = artifact;
        this.emit(project, { type: "stage", stage: stageRecord.stage, state: "done", artifact });
      }

      await this.persist(root, project);
      if (record.state !== "running") break;
    }

    if (record.state === "running") record.state = "done";
    record.completedAt = Date.now();
    try {
      await this.persist(root, project);
    } catch (error) {
      console.error(`Failed to persist build run for ${root}`, error);
    }
    this.emit(project, { type: "done", run: snapshot(record) });
  }

  async cancel(projectRoot, runId) {
    const root = path.resolve(projectRoot);
    const project = this.projects.get(root);
    if (!project?.current || project.current.id !== runId) return false;
    if (project.current.state !== "running") return false;
    project.current.state = "canceled";
    project.controller?.cancel();
    return true;
  }

  /** Wait for queued build-runs.json writes (used by tests). */
  async flush(projectRoot) {
    const project = this.projects.get(path.resolve(projectRoot));
    if (!project) return;
    if (project.executing) await project.executing.catch(() => {});
    await project.writeChain.catch(() => {});
  }

  async clear(projectRoot) {
    const root = path.resolve(projectRoot);
    const project = await this.load(root);
    if (project.current?.state === "running") return false;
    project.current = null;
    await this.persist(root, project);
    this.emit(project, { type: "snapshot", current: null });
    return true;
  }
}
