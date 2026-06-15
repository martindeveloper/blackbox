import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { BUILD_RUNS_PATH } from "../../shared/blackboxPaths.js";
import { isStageAllowed, spawnStage, stagesForPlatform } from "./cli.js";

const SCHEMA_VERSION = 1;
const MAX_LOG_LINES = 5000;

function stageSnapshot(stage) {
  return { stage: stage.stage, state: stage.state, artifact: stage.artifact };
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
      log: [],
      emitter: new EventEmitter(),
      controller: null,
      writeChain: Promise.resolve(),
      ready: null,
    };
    project.emitter.setMaxListeners(0);
    this.projects.set(root, project);
    project.ready = (async () => {
      try {
        const stored = JSON.parse(await fs.readFile(this.filePath(root), "utf8"));
        if (stored?.version === SCHEMA_VERSION && isStoredRun(stored.run)) {
          const run = stored.run;
          // A run still marked running means the editor stopped mid-build.
          if (run.state === "running") {
            run.state = "error";
            run.completedAt = run.completedAt ?? Date.now();
            run.error = "Build was interrupted when the editor stopped";
            for (const stage of run.stages) {
              if (stage.state === "running") stage.state = "error";
            }
            project.current = { ...run, stages: run.stages };
            await this.persist(root, project);
          } else {
            project.current = { ...run, stages: run.stages };
          }
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
    const contents = `${JSON.stringify({ version: SCHEMA_VERSION, run }, null, 2)}\n`;
    const target = this.filePath(projectRoot);
    const temporary = `${target}.${randomUUID()}.tmp`;
    project.writeChain = project.writeChain
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(temporary, contents);
        await fs.rename(temporary, target);
      });
    return project.writeChain;
  }

  emit(project, event) {
    if (event.type === "log") {
      project.log.push(event.line);
      if (project.log.length > MAX_LOG_LINES) {
        project.log.splice(0, project.log.length - MAX_LOG_LINES);
      }
    }
    project.emitter.emit("event", event);
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
    return project.current ? { run: snapshot(project.current), log: [...project.log] } : null;
  }

  isRunning(projectRoot) {
    const project = this.projects.get(path.resolve(projectRoot));
    return project?.current?.state === "running";
  }

  /** Start a build run of the given ordered stages. One run per project at a time. */
  async start(projectRoot, { platform, configuration, stages }) {
    const root = path.resolve(projectRoot);
    const project = await this.load(root);
    if (project.current?.state === "running") {
      return { run: snapshot(project.current), log: [...project.log], alreadyRunning: true };
    }

    const ordered = stagesForPlatform(platform).filter(
      (stage) => stages.includes(stage) && isStageAllowed(stage, platform),
    );

    const record = {
      id: randomUUID(),
      platform,
      configuration,
      state: "running",
      startedAt: Date.now(),
      completedAt: null,
      stages: ordered.map((stage) => ({ stage, state: "pending", artifact: null })),
      artifact: null,
      error: null,
    };
    project.current = record;
    project.log = [];
    await this.persist(root, project);
    this.emit(project, { type: "started", run: snapshot(record) });

    void this.execute(root, project, record);

    return { run: snapshot(record), log: [], alreadyRunning: false };
  }

  async execute(root, project, record) {
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
        },
        (line) => this.emit(project, { type: "log", line }),
      );
      project.controller = handle;
      const { exitCode, canceled, artifact } = await handle.done;
      project.controller = null;

      if (canceled) {
        stageRecord.state = "canceled";
        record.state = "canceled";
        this.emit(project, { type: "stage", stage: stageRecord.stage, state: "canceled" });
        break;
      }
      if (exitCode !== 0) {
        stageRecord.state = "error";
        record.state = "error";
        record.error = `Stage "${stageRecord.stage}" exited with code ${exitCode}`;
        this.emit(project, { type: "stage", stage: stageRecord.stage, state: "error" });
        break;
      }
      stageRecord.state = "done";
      stageRecord.artifact = artifact;
      record.artifact = artifact;
      this.emit(project, { type: "stage", stage: stageRecord.stage, state: "done", artifact });
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
}
