import fs from "node:fs/promises";
import path from "node:path";
import { BUNDLE_CACHE, WORK_DIR, bundledToolsEnabled, toolBinPath } from "./config.js";
import { getCargoTargetDir, runProcess, runCargo, platformBin, discoverOneTool } from "./cargo.js";
import { nullTools } from "./editorConfig.js";
import { commandResult, parseLint, parseSimulator } from "./parsers.js";
import { readUserPrefs, writeUserPrefs, sanitizePrefs } from "./prefs.js";
import { ProjectError } from "./projectService.js";
import { ToolRunRegistry } from "./toolRuns.js";
import { BuildRunRegistry } from "./pipeline/buildRuns.js";
import { stagesForPlatform } from "../shared/buildStages.js";
import {
  GlobalRoutes,
  ProjectRoutes,
  serverBuildRunCancelRoute,
  serverProjectMediaRoute,
  serverProjectRoute,
  serverToolsRunRoute,
} from "../shared/apiPaths.js";
import { isValidConfiguration, isValidPlatform, isStageAllowed } from "./pipeline/cli.js";
import { detectBuildCapabilities } from "./pipeline/preflight/index.js";
import { getPlayer, listPlayers, playersWith } from "../players/registry.mjs";
import { runPlayerBundle } from "./tools/bundle.mjs";
import { ensureProjectSidecars, writeNewProject } from "./projectScaffold.js";

const previewPlayer = playersWith("livePreview")[0] ?? null;

function toolDiscoverySource(defaultBinName, binPath) {
  if (!binPath) return "config";
  const bundled = toolBinPath(defaultBinName);
  if (bundled && bundledToolsEnabled()) {
    if (path.resolve(binPath) === path.resolve(bundled)) return "bundle";
  }
  return "config";
}

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
  const buildRuns = new BuildRunRegistry();

  app.get(GlobalRoutes.Prefs, () => readUserPrefs());
  app.put(GlobalRoutes.Prefs, async (request, reply) => {
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
      return reply.code(400).send({ code: "invalid_request", message: "body must be an object" });
    }
    const merged = { ...(await readUserPrefs()), ...sanitizePrefs(request.body) };
    await writeUserPrefs(merged);
    return merged;
  });

  app.get(GlobalRoutes.Players, () => ({ players: listPlayers() }));

  app.get(GlobalRoutes.Projects, async () => ({ projects: service.listProjects() }));

  app.post(GlobalRoutes.ProjectsRegister, async (request, reply) => {
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

  app.post(GlobalRoutes.ProjectsCreate, async (request, reply) => {
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

    const withCode = body.withCode === true;
    const withExample = body.withExample === true;

    // Folder already on disk (e.g. a retried create) — repair sidecars, then register.
    if (scenarioExists) {
      try {
        await ensureProjectSidecars(projectPath);
        const project = await service.registerProject(projectPath);
        await service.finalizeAuthorCreatedProjectTrust(project.id, { withCode });
        return { project: service.projectSummary(service.requireProject(project.id)) };
      } catch (error) {
        return sendError(reply, error);
      }
    }

    let created = false;
    try {
      await writeNewProject(projectPath, {
        title,
        firstChapterId,
        firstChapterTitle,
        withExample,
      });
      created = true;

      const project = await service.registerProject(projectPath);
      await service.finalizeAuthorCreatedProjectTrust(project.id, { withCode });
      return { project: service.projectSummary(service.requireProject(project.id)) };
    } catch (error) {
      if (created) {
        await fs.rm(projectPath, { recursive: true, force: true }).catch(() => {});
      }
      return sendError(reply, error);
    }
  });

  app.post(
    serverProjectRoute(ProjectRoutes.Open),
    projectRequest(service, (project, request) =>
      service.openProject(project.id, request.body?.acceptEditorVersion === true),
    ),
  );

  app.post(
    serverProjectRoute(ProjectRoutes.TrustCode),
    projectRequest(service, (project, request) =>
      service.setProjectCodeTrust(project.id, request.body?.trusted),
    ),
  );

  app.post(
    serverProjectRoute(ProjectRoutes.BootstrapCode),
    projectRequest(service, (project) => service.bootstrapProjectCode(project.id)),
  );

  app.post(GlobalRoutes.ProjectsRevokeCodeTrust, () => service.revokeAllProjectCodeTrust());

  app.post(
    serverProjectRoute(ProjectRoutes.Delete),
    projectRequest(service, async (project, request) => {
      const confirmName =
        typeof request.body?.confirmName === "string" ? request.body.confirmName : "";
      await service.deleteProject(project.id, confirmName);
      return { ok: true };
    }),
  );

  app.get(
    serverProjectRoute(ProjectRoutes.Events),
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
    serverProjectRoute(ProjectRoutes.Heatmap),
    projectRequest(service, (project) => service.readHeatmap(project.id)),
  );
  app.put(
    serverProjectRoute(ProjectRoutes.Heatmap),
    projectRequest(service, (project, request) =>
      service.writeHeatmap(project.id, request.body ?? {}),
    ),
  );
  app.delete(
    serverProjectRoute(ProjectRoutes.Heatmap),
    projectRequest(service, (project) => service.deleteHeatmap(project.id)),
  );

  app.put(
    serverProjectRoute(ProjectRoutes.Documents),
    projectRequest(service, (project, request) =>
      service.saveDocuments(project.id, request.body ?? {}),
    ),
  );

  app.get(
    serverProjectMediaRoute(),
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
    serverProjectRoute(ProjectRoutes.PreviewDocs),
    projectRequest(service, (project) => service.readPreviewDocs(project.id)),
  );

  app.get(
    serverProjectRoute(ProjectRoutes.PreviewBuild),
    projectRequest(service, async (project, request, reply) => {
      if (!previewPlayer) {
        return reply.code(503).send({
          code: "preview_unavailable",
          message: "No live-preview player is registered",
        });
      }
      try {
        return await previewPlayer.ensurePreviewBuilt(project, {
          force: request.query?.force === "1" || request.query?.force === "true",
        });
      } catch (error) {
        // ensurePreviewBuilt throws plain build errors (not ProjectError), which
        // sendError would re-throw into a bodyless 500. Log the stack and return
        // the message so the cause is visible in the log file and to the client.
        console.error("[editor] preview build failed:", error);
        return reply.code(500).send({
          code: "preview_build_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  app.post(
    serverProjectRoute(ProjectRoutes.Media),
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
    serverProjectRoute(ProjectRoutes.MediaTrash),
    projectRequest(service, (project, request) =>
      service.moveMediaToTrash(project.id, request.body ?? {}),
    ),
  );
  app.post(
    serverProjectRoute(ProjectRoutes.TrashRestore),
    projectRequest(service, (project, request) =>
      service.restoreTrash(project.id, request.body ?? {}),
    ),
  );
  app.post(
    serverProjectRoute(ProjectRoutes.TrashDelete),
    projectRequest(service, (project, request) =>
      service.deleteTrash(project.id, request.body ?? {}),
    ),
  );
  app.post(
    serverProjectRoute(ProjectRoutes.TrashEmpty),
    projectRequest(service, (project, request) =>
      service.emptyTrash(project.id, request.body ?? {}),
    ),
  );

  app.get(
    serverProjectRoute(ProjectRoutes.ToolsDiscover),
    projectRequest(service, async (project) => {
      const tools = project.tools ?? nullTools();
      const [linter, bundler, simulator] = await Promise.all([
        discoverOneTool(
          "blackbox-lint",
          tools.linter,
          toolDiscoverySource("blackbox-lint", tools.linter),
        ),
        discoverOneTool(
          "blackbox-bundler",
          tools.bundler,
          toolDiscoverySource("blackbox-bundler", tools.bundler),
        ),
        discoverOneTool(
          "blackbox-simulator",
          tools.simulator,
          toolDiscoverySource("blackbox-simulator", tools.simulator),
        ),
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
    serverProjectRoute(ProjectRoutes.ToolsBuild),
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

  app.get(
    serverToolsRunRoute(),
    projectRequest(service, async (project, request, reply) => {
      const tool = parseTool(request.params.tool);
      if (!tool) {
        return reply.code(400).send({ code: "invalid_request", message: "invalid tool" });
      }
      return { run: await toolRuns.get(project.path, tool) };
    }),
  );

  app.post(
    serverToolsRunRoute(),
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

  app.get(
    serverProjectRoute(ProjectRoutes.BuildCapabilities),
    projectRequest(service, async (project) => await detectBuildCapabilities(project.path)),
  );

  app.post(
    serverProjectRoute(ProjectRoutes.BuildRuns),
    projectRequest(service, async (project, request, reply) => {
      const body = request.body ?? {};
      const platform = typeof body.platform === "string" ? body.platform : "";
      const configuration = typeof body.configuration === "string" ? body.configuration : "";
      const stages = Array.isArray(body.stages) ? body.stages : [];
      // Player-bundle option; defaults on unless explicitly false.
      const reactCompiler = body.reactCompiler !== false;
      // Fresh build; defaults off. Wipes the configuration's build cache before stages run.
      const clean = body.clean === true;

      if (!isValidPlatform(platform)) {
        return reply
          .code(400)
          .send({ code: "invalid_request", message: "platform must be web, ios, or android" });
      }
      if (!isValidConfiguration(configuration)) {
        return reply
          .code(400)
          .send({ code: "invalid_request", message: "configuration must be debug or release" });
      }
      const allowed = stagesForPlatform(platform);
      const selected = allowed.filter((stage) => stages.includes(stage));
      if (selected.length === 0) {
        return reply
          .code(400)
          .send({ code: "invalid_request", message: "select at least one valid stage" });
      }
      const rejected = stages.filter((stage) => !isStageAllowed(stage, platform));
      if (rejected.length > 0) {
        return reply.code(400).send({
          code: "invalid_request",
          message: `stage(s) not available for ${platform}: ${rejected.join(", ")}`,
        });
      }

      const result = await buildRuns.start(project.path, {
        platform,
        configuration,
        stages: selected,
        reactCompiler,
        clean,
      });
      return reply.code(result.alreadyRunning ? 409 : 202).send(result);
    }),
  );

  app.post(
    serverBuildRunCancelRoute(),
    projectRequest(service, async (project, request) => ({
      canceled: await buildRuns.cancel(project.path, request.params.runId),
    })),
  );

  app.delete(
    serverProjectRoute(ProjectRoutes.BuildRunsCurrent),
    projectRequest(service, async (project, request, reply) => {
      const cleared = await buildRuns.clear(project.path);
      if (!cleared) {
        return reply
          .code(409)
          .send({ code: "build_running", message: "Cannot clear while a build is running" });
      }
      return { cleared: true };
    }),
  );

  app.get(
    serverProjectRoute(ProjectRoutes.BuildRunsStream),
    projectRequest(service, async (project, request, reply) => {
      const current = await buildRuns.getCurrent(project.path);
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const send = (event) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      send({ type: "snapshot", current });
      const unsubscribe = buildRuns.subscribe(project.path, send);
      request.raw.on("close", unsubscribe);
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
    const defaultPlayerId = playersWith("bundle")[0]?.manifest.id;
    const playerId = typeof body.platform === "string" ? body.platform : defaultPlayerId;
    const player = playerId ? getPlayer(playerId) : null;
    if (!player?.manifest.capabilities.bundle) {
      throw new ProjectError(
        "invalid_request",
        `Unknown or non-bundling player: ${playerId ?? String(body.platform)}`,
      );
    }
    return runPlayerBundle({
      platform: player.manifest.id,
      projectPath: locked.path,
      tools: locked.tools ?? nullTools(),
      workDir: WORK_DIR,
      bundleCache: BUNDLE_CACHE,
      ignoreMissing: body.ignoreMissing === true,
    });
  });
}
