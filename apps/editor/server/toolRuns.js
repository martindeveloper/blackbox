import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { TOOL_RUNS_PATH } from "../shared/blackboxPaths.js";

const SCHEMA_VERSION = 1;
const TOOLS = ["linter", "bundle", "simulator"];

function failedResult(error) {
  return {
    ok: false,
    exitCode: -1,
    raw: { stdout: "", stderr: "" },
    parsed: null,
    error: error instanceof Error ? error.message : String(error),
  };
}

function killedResult() {
  return failedResult("Tool run was killed");
}

function snapshot(record) {
  return {
    id: record.id,
    tool: record.tool,
    state: record.state,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    result: record.result,
    request: record.request,
  };
}

function isStoredRun(value, tool) {
  return (
    value &&
    typeof value === "object" &&
    value.tool === tool &&
    typeof value.id === "string" &&
    (value.state === "running" || value.state === "done" || value.state === "error") &&
    Number.isFinite(value.startedAt) &&
    (value.completedAt === null || Number.isFinite(value.completedAt)) &&
    value.request &&
    typeof value.request === "object"
  );
}

export class ToolRunRegistry {
  constructor() {
    this.projects = new Map();
  }

  filePath(projectRoot) {
    return path.join(projectRoot, TOOL_RUNS_PATH);
  }

  async load(projectRoot) {
    const root = path.resolve(projectRoot);
    const existing = this.projects.get(root);
    if (existing) {
      await existing.ready;
      return existing;
    }

    const project = { runs: new Map(), writeChain: Promise.resolve(), ready: null };
    this.projects.set(root, project);
    project.ready = (async () => {
      try {
        const stored = JSON.parse(await fs.readFile(this.filePath(root), "utf8"));
        if (stored?.version === SCHEMA_VERSION && stored.runs && typeof stored.runs === "object") {
          for (const tool of TOOLS) {
            const record = stored.runs[tool];
            if (isStoredRun(record, tool)) project.runs.set(tool, record);
          }
        }
      } catch (error) {
        if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      }

      let recoveredRunning = false;
      for (const record of project.runs.values()) {
        if (record.state !== "running") continue;
        record.state = "error";
        record.completedAt = Date.now();
        record.result = failedResult("Tool run was interrupted when the editor API stopped");
        recoveredRunning = true;
      }
      if (recoveredRunning) await this.persist(root, project);
    })();
    await project.ready;
    return project;
  }

  async persist(projectRoot, project) {
    const runs = Object.fromEntries(
      TOOLS.flatMap((tool) => {
        const record = project.runs.get(tool);
        return record ? [[tool, snapshot(record)]] : [];
      }),
    );
    const contents = `${JSON.stringify({ version: SCHEMA_VERSION, runs }, null, 2)}\n`;
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

  async get(projectRoot, tool) {
    const project = await this.load(projectRoot);
    const record = project.runs.get(tool);
    return record ? snapshot(record) : null;
  }

  async flush(projectRoot) {
    const project = await this.load(projectRoot);
    await project.writeChain;
  }

  async start(projectRoot, tool, request, execute) {
    const project = await this.load(projectRoot);
    const current = project.runs.get(tool);
    if (current?.state === "running") return snapshot(current);

    const controller = new AbortController();
    const record = {
      id: randomUUID(),
      tool,
      state: "running",
      startedAt: Date.now(),
      completedAt: null,
      result: null,
      request,
      controller,
    };
    project.runs.set(tool, record);
    await this.persist(projectRoot, project);

    void Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) return killedResult();
        return execute(controller.signal);
      })
      .catch(failedResult)
      .then(async (result) => {
        if (record.state !== "running") return;
        record.result = result;
        record.state = result.ok ? "done" : "error";
        record.completedAt = Date.now();
        try {
          await this.persist(projectRoot, project);
        } catch (error) {
          console.error(`Failed to persist ${tool} run for project ${projectRoot}`, error);
        }
      });

    return snapshot(record);
  }

  async cancel(projectRoot, tool) {
    const project = await this.load(projectRoot);
    const record = project.runs.get(tool);
    if (!record || record.state !== "running") return null;
    record.controller?.abort();
    record.result = killedResult();
    record.state = "error";
    record.completedAt = Date.now();
    await this.persist(projectRoot, project);
    return snapshot(record);
  }
}
