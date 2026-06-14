import fs from "node:fs/promises";
import path from "node:path";
import { BUNDLE_CACHE, WORK_DIR, bundledToolsEnabled } from "./config.js";
import { getCargoTargetDir, runProcess, runCargo, platformBin, discoverOneTool } from "./cargo.js";
import { nullTools } from "./editorConfig.js";
import { commandResult, appendOutput, parseLint, parseBundle, parseSimulator } from "./parsers.js";
import { readUserPrefs, writeUserPrefs, sanitizePrefs } from "./prefs.js";
import { ProjectError } from "./projectService.js";
import { ToolRunRegistry } from "./toolRuns.js";
import { ensurePreviewBuilt } from "./previewBuild.js";
import { ensureProjectSidecars, writeNewProject } from "./projectScaffold.js";

function sendError(reply, error) {
  if (!(error instanceof ProjectError)) throw error;
  const status =
    error.code === "revision_conflict" || error.code === "file_exists"
      ? 409
      : error.code === "not_found"
        ? 404
        : 400;
  return reply.code(status).send({ code: error.code, message: error.message, ...error.details });
}

function projectRequest(service, handler) {
  return async (request, reply) => {
    try {
      return await handler(service.requireProject(request.params.id), request, reply);
    } catch (error) {
      return sendError(reply, error);
    }
  };
}

export async function registerRoutes(app, service) {
  const toolRuns = new ToolRunRegistry();

  app.get("/prefs", () => readUserPrefs());
  app.put("/prefs", async (request, reply) => {
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
      return reply.code(400).send({ code: "invalid_request", message: "body must be an object" });
    }
    const merged = { ...(await readUserPrefs()), ...sanitizePrefs(request.body) };
    await writeUserPrefs(merged);
    return merged;
  });

  app.get("/projects", async () => ({ projects: service.listProjects() }));

  app.post("/projects/register", async (request, reply) => {
    const projectPath = typeof request.body?.path === "string" ? request.body.path.trim() : "";
    if (!projectPath) {
      return reply.code(400).send({ code: "invalid_request", message: "path is required" });
    }
    try {
      const project = await service.registerProject(path.resolve(projectPath));
      return { project };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/projects/create", async (request, reply) => {
    const body = request.body ?? {};
    const parentPath = typeof body.parentPath === "string" ? body.parentPath.trim() : "";
    const folderName = typeof body.folderName === "string" ? body.folderName.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "Untitled";
    const firstChapterId =
      typeof body.firstChapterId === "string" && body.firstChapterId.trim()
        ? body.firstChapterId.trim()
        : "prologue";
    const firstChapterTitle =
      typeof body.firstChapterTitle === "string" && body.firstChapterTitle.trim()
        ? body.firstChapterTitle.trim()
        : "Prologue";

    if (!parentPath || !folderName) {
      return reply
        .code(400)
        .send({ code: "invalid_request", message: "parentPath and folderName are required" });
    }

    const projectPath = path.resolve(path.join(parentPath, folderName));

    const scenarioPath = path.join(projectPath, "scenario.json");
    let scenarioExists = false;
    try {
      await fs.access(scenarioPath);
      scenarioExists = true;
    } catch {}

    // Folder already on disk (e.g. a retried create) — repair sidecars, then register.
    if (scenarioExists) {
      try {
        await ensureProjectSidecars(projectPath);
        const project = await service.registerProject(projectPath);
        return { project };
      } catch (error) {
        return sendError(reply, error);
      }
    }

    let created = false;
    try {
      await writeNewProject(projectPath, { title, firstChapterId, firstChapterTitle });
      created = true;

      const project = await service.registerProject(projectPath);
      return { project };
    } catch (error) {
      if (created) {
        await fs.rm(projectPath, { recursive: true, force: true }).catch(() => {});
      }
      return sendError(reply, error);
    }
  });

  app.post(
    "/projects/:id/open",
    projectRequest(service, (project) => service.openProject(project.id)),
  );

  app.post(
    "/projects/:id/trust-ui",
    projectRequest(service, (project, request) =>
      service.setProjectUiTrust(project.id, request.body?.trusted),
    ),
  );

  app.post(
    "/projects/:id/delete",
    projectRequest(service, async (project, request) => {
      const confirmName =
        typeof request.body?.confirmName === "string" ? request.body.confirmName : "";
      await service.deleteProject(project.id, confirmName);
      return { ok: true };
    }),
  );

  app.get(
    "/projects/:id/events",
    projectRequest(service, (project, request, reply) => {
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      reply.raw.write(
        `data: ${JSON.stringify({ revision: project.revision, changedPaths: [] })}\n\n`,
      );
      const unsubscribe = service.subscribe(project.id, (event) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      });
      request.raw.on("close", unsubscribe);
    }),
  );

  app.get(
    "/projects/:id/heatmap",
    projectRequest(service, (project) => service.readHeatmap(project.id)),
  );
  app.put(
    "/projects/:id/heatmap",
    projectRequest(service, (project, request) =>
      service.writeHeatmap(project.id, request.body ?? {}),
    ),
  );
  app.delete(
    "/projects/:id/heatmap",
    projectRequest(service, (project) => service.deleteHeatmap(project.id)),
  );

  app.put(
    "/projects/:id/documents",
    projectRequest(service, (project, request) =>
      service.saveDocuments(project.id, request.body ?? {}),
    ),
  );

  app.get(
    "/projects/:id/media/*",
    projectRequest(service, async (project, request, reply) => {
      const relativePath = request.params["*"];
      const media = await service.readMedia(project.id, relativePath);
      const range = request.headers.range;
      reply.header("Accept-Ranges", "bytes").type(media.mimeType);
      if (!range) return reply.send(media.data);

      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        return reply.code(416).header("Content-Range", `bytes */${media.data.length}`).send();
      }
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : media.data.length - 1;
      if (start > end || start >= media.data.length) {
        return reply.code(416).header("Content-Range", `bytes */${media.data.length}`).send();
      }
      const boundedEnd = Math.min(end, media.data.length - 1);
      return reply
        .code(206)
        .header("Content-Range", `bytes ${start}-${boundedEnd}/${media.data.length}`)
        .header("Content-Length", String(boundedEnd - start + 1))
        .send(media.data.subarray(start, boundedEnd + 1));
    }),
  );

  app.get(
    "/projects/:id/preview-docs",
    projectRequest(service, (project) => service.readPreviewDocs(project.id)),
  );

  // Compile (or reuse) the preview bundle for this project's game. The editor
  // panel calls this to show a build loader and to force-rebuild after edits.
  app.get(
    "/projects/:id/preview-build",
    projectRequest(service, (project, request) =>
      ensurePreviewBuilt(project, {
        force: request.query?.force === "1" || request.query?.force === "true",
      }),
    ),
  );

  app.post(
    "/projects/:id/media",
    projectRequest(service, async (project, request, reply) => {
      const part = await request.file({ limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
      if (!part) {
        return reply.code(400).send({ code: "invalid_request", message: "file is required" });
      }
      const fields = part.fields;
      const baseRevision = Number(fields.baseRevision?.value);
      const targetDir = String(fields.targetDir?.value ?? "");
      const clientId = String(fields.clientId?.value ?? "");
      return service.uploadMedia(project.id, {
        baseRevision,
        targetDir,
        filename: part.filename,
        data: await part.toBuffer(),
        clientId,
      });
    }),
  );

  app.post(
    "/projects/:id/media/trash",
    projectRequest(service, (project, request) =>
      service.moveMediaToTrash(project.id, request.body ?? {}),
    ),
  );
  app.post(
    "/projects/:id/trash/restore",
    projectRequest(service, (project, request) =>
      service.restoreTrash(project.id, request.body ?? {}),
    ),
  );
  app.post(
    "/projects/:id/trash/delete",
    projectRequest(service, (project, request) =>
      service.deleteTrash(project.id, request.body ?? {}),
    ),
  );
  app.post(
    "/projects/:id/trash/empty",
    projectRequest(service, (project, request) =>
      service.emptyTrash(project.id, request.body ?? {}),
    ),
  );

  app.get(
    "/projects/:id/tools/discover",
    projectRequest(service, async (project) => {
      const tools = project.tools ?? nullTools();
      const [linter, bundler, simulator] = await Promise.all([
        discoverOneTool("blackbox-lint", tools.linter),
        discoverOneTool("blackbox-bundler", tools.bundler),
        discoverOneTool("blackbox-simulator", tools.simulator),
      ]);
      return {
        linter,
        bundler,
        simulator,
        buildEnabled: !bundledToolsEnabled(),
        updatedAt: new Date().toISOString(),
      };
    }),
  );

  app.post(
    "/projects/:id/tools/build",
    projectRequest(service, async (project, request, reply) => {
      if (bundledToolsEnabled()) {
        return reply.code(400).send({
          ok: false,
          error: "Tool rebuild is disabled while using bundled engine binaries",
        });
      }
      const toolName = request.body?.tool;
      if (!["linter", "bundler", "simulator", "all"].includes(toolName)) {
        return reply.code(400).send({ code: "invalid_request", message: "invalid tool" });
      }
      const tools = project.tools ?? nullTools();
      const tasks = [];
      if (toolName === "linter" || toolName === "all")
        tasks.push({ name: "linter", cmd: tools.linterBuild });
      if (toolName === "bundler" || toolName === "all")
        tasks.push({ name: "bundler", cmd: tools.bundlerBuild });
      if (toolName === "simulator" || toolName === "all")
        tasks.push({ name: "simulator", cmd: tools.simulatorBuild });
      if (tasks.some((task) => !task.cmd)) {
        return reply.code(400).send({ ok: false, error: "Tool build command is not configured" });
      }
      const buildEnv = { CARGO_TARGET_DIR: await getCargoTargetDir() };
      const results = [];
      for (const task of tasks) {
        const [executable, ...args] = task.cmd.split(/\s+/).filter(Boolean);
        results.push({
          tool: task.name,
          ...commandResult(await runProcess(executable, args, WORK_DIR, buildEnv)),
        });
      }
      return { ok: results.every((result) => result.ok), results };
    }),
  );

  app.post(
    "/projects/:id/lint",
    projectRequest(service, async (project, request) => {
      return executeTool(service, project.id, "linter", request.body ?? {});
    }),
  );

  app.post(
    "/projects/:id/simulate",
    projectRequest(service, async (project, request) => {
      return executeTool(service, project.id, "simulator", request.body ?? {});
    }),
  );

  app.post(
    "/projects/:id/bundle",
    projectRequest(service, async (project, request) => {
      return executeTool(service, project.id, "bundle", request.body ?? {});
    }),
  );

  app.get(
    "/projects/:id/tools/runs/:tool",
    projectRequest(service, async (project, request, reply) => {
      const tool = parseTool(request.params.tool);
      if (!tool) {
        return reply.code(400).send({ code: "invalid_request", message: "invalid tool" });
      }
      return { run: await toolRuns.get(project.path, tool) };
    }),
  );

  app.post(
    "/projects/:id/tools/runs/:tool",
    projectRequest(service, async (project, request, reply) => {
      const tool = parseTool(request.params.tool);
      if (!tool) {
        return reply.code(400).send({ code: "invalid_request", message: "invalid tool" });
      }
      const body = request.body ?? {};
      const run = await toolRuns.start(project.path, tool, body, () =>
        executeTool(service, project.id, tool, body),
      );
      return reply.code(run.state === "running" ? 202 : 200).send({ run });
    }),
  );
}

function parseTool(value) {
  return value === "linter" || value === "bundle" || value === "simulator" ? value : null;
}

function executeTool(service, projectId, tool, body) {
  if (tool === "linter") return executeLinter(service, projectId, body);
  if (tool === "simulator") return executeSimulator(service, projectId, body);
  return executeBundle(service, projectId, body);
}

function executeLinter(service, projectId, body) {
  return service.withRevision(projectId, body.expectedRevision, async (locked) => {
    const scenarioPath = path.join(locked.path, "scenario.json");
    const tools = locked.tools ?? nullTools();
    const args = [scenarioPath, "--json"];
    const ignore = Array.isArray(body.ignore) ? body.ignore : [];
    const only = Array.isArray(body.only) ? body.only : [];
    for (const id of ignore) if (typeof id === "string") args.push("--ignore", id);
    for (const id of only) if (typeof id === "string") args.push("--only", id);
    const result = tools.linter
      ? await runProcess(platformBin(tools.linter), args, WORK_DIR)
      : await runCargo("blackbox-lint", args);
    return { ...commandResult(result), parsed: parseLint(result.stdout) };
  });
}

function executeSimulator(service, projectId, body) {
  return service.withRevision(projectId, body.expectedRevision, async (locked) => {
    const tools = locked.tools ?? nullTools();
    const args = [locked.path];
    const mode = body.mode === "explore" ? "explore" : "goals";
    args.push("--mode", mode);

    if (mode === "goals") {
      const goals =
        typeof body.goals === "string" && body.goals.trim() ? body.goals.trim() : "ending";
      args.push("--goals", goals);
      const goalBudget = Number(body.goalBudget);
      if (Number.isFinite(goalBudget) && goalBudget > 0) {
        args.push("--goal-budget", String(Math.floor(goalBudget)));
      }
      args.push("--heuristic", body.heuristic === "none" ? "none" : "graph");
    } else {
      const maxStates = Number(body.maxStates);
      if (Number.isFinite(maxStates) && maxStates > 0) {
        args.push("--max-states", String(Math.floor(maxStates)));
      }
    }

    const threads = Number(body.threads);
    if (Number.isFinite(threads) && threads > 0) {
      args.push("--threads", String(Math.floor(threads)));
    }
    if (body.check === true) args.push("--check");
    if (body.verbose === true) args.push("--verbose");
    if (body.analytics === true) args.push("--analytics");
    args.push("--json");

    const result = tools.simulator
      ? await runProcess(platformBin(tools.simulator), args, WORK_DIR)
      : await runCargo("blackbox-simulator", args);
    return { ...commandResult(result), parsed: parseSimulator(result.stdout) };
  });
}

function executeBundle(service, projectId, body) {
  return service.withRevision(projectId, body.expectedRevision, async (locked) => {
    const platform = typeof body.platform === "string" ? body.platform : "web";
    const ignoreMissing = body.ignoreMissing === true;
    const bundleWorkDir = path.join(WORK_DIR, ".cache");
    await fs.mkdir(bundleWorkDir, { recursive: true });
    await fs.mkdir(BUNDLE_CACHE, { recursive: true });
    const outputDir = await fs.mkdtemp(path.join(bundleWorkDir, "editor-bundle-"));
    try {
      const tools = locked.tools ?? nullTools();
      const args = [
        path.join(locked.path, "scenario.json"),
        "--platform",
        platform,
        "-o",
        outputDir,
        "--cache-dir",
        BUNDLE_CACHE,
        "--json",
      ];
      if (ignoreMissing) args.push("--ignore-missing");
      const bundle = tools.bundler
        ? await runProcess(platformBin(tools.bundler), args, WORK_DIR)
        : await runCargo("blackbox-bundler", args, { release: true });
      const stdout = [];
      const stderr = [];
      appendOutput(stdout, "bundle", bundle);
      if (bundle.stderr) stderr.push(bundle.stderr);
      let inspect = { exitCode: bundle.exitCode, stdout: "", stderr: "" };
      if (bundle.exitCode === 0) {
        const inspectArgs = ["inspect", outputDir, "--json"];
        inspect = tools.bundler
          ? await runProcess(platformBin(tools.bundler), inspectArgs, WORK_DIR)
          : await runCargo("blackbox-bundler", inspectArgs, { release: true });
        appendOutput(stdout, "inspect", inspect);
        if (inspect.stderr) stderr.push(inspect.stderr);
      }
      const exitCode = bundle.exitCode || inspect.exitCode;
      return {
        ok: exitCode === 0,
        exitCode,
        raw: { stdout: stdout.join(""), stderr: stderr.join("") },
        phases: { bundle: commandResult(bundle), inspect: commandResult(inspect) },
        parsed: parseBundle(bundle.stdout, inspect.stdout, bundle.stderr),
      };
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });
}
