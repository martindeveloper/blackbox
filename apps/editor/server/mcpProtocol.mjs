import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { summarizeDocumentChanges } from "./mcpAuditDiff.mjs";
import { applyDocumentPatch, PATCH_COLLECTIONS } from "./mcpPatch.mjs";
import { SCHEMA_REFERENCE } from "./mcpSchema.mjs";
import { executeBundle, executeLinter, executeScout, executeSimulator } from "./routes.js";
import {
  auditArguments,
  CHAPTER_ID_PATTERN,
  jsonText,
  MAX_MEDIA_BYTES,
  MAX_PATCH_OPS,
  newChapterDocument,
  publicProject,
  publicSnapshot,
  findNode,
  scoutPatchLocator,
  toolError,
} from "./mcpHelpers.mjs";

export function createProtocolServer({ projectService, isRendererDirty, auditTool, client }) {
  const server = new McpServer(
    {
      name: "blackbox-editor",
      version: "1.0.0",
    },
    {
      instructions:
        "Call describe_schema (or read blackbox://schema) before authoring so conditions and " +
        "effects are valid. Use project revisions for every mutation and read a project immediately " +
        "before saving. Prefer patch_documents for targeted edits (one node, choice, or catalog " +
        "record at a time) so unrelated content is never rewritten; reserve save_documents for " +
        "whole-document rewrites, and use add_chapter to create and register a new chapter. " +
        "If a revision conflict occurs, read again and reconcile instead of forcing an overwrite.",
    },
  );

  const readSnapshot = async (projectId) => projectService.openProject(projectId, false);
  const contributor = {
    kind: "agent",
    name: client.name,
    version: client.version,
  };
  const mutationEvent = (changeSummary) => ({
    source: "mcp",
    contribution: {
      status: "applied",
      contributor,
      review: { type: "mcp-audit" },
      ...changeSummary,
    },
  });
  const mutationGuard = (projectId) => {
    if (isRendererDirty()) {
      projectService.notify(projectId, {
        source: "mcp",
        contribution: {
          status: "blocked",
          contributor,
        },
      });
      const error = new Error(
        "The editor has unsaved changes. Ask the user to save or discard them before an agent mutation.",
      );
      error.code = "editor_dirty";
      throw error;
    }
  };
  const registerTool = (name, config, handler) => {
    server.registerTool(name, config, async (args, extra) => {
      const started = Date.now();
      const auditDetails = {};
      let result;
      try {
        result = await handler(args, extra, auditDetails);
        return result;
      } catch (error) {
        result = toolError(error);
        return result;
      } finally {
        void auditTool({
          type: "tool",
          client,
          tool: name,
          arguments: auditArguments(name, args),
          ...auditDetails,
          outcome: result?.isError === true ? "error" : "success",
          durationMs: Date.now() - started,
        });
      }
    });
  };

  server.registerResource(
    "blackbox-projects",
    "blackbox://projects",
    {
      title: "Blackbox projects",
      description: "Projects registered in the running Blackbox Editor",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            { projects: projectService.listProjects().map(publicProject) },
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerResource(
    "blackbox-schema",
    "blackbox://schema",
    {
      title: "Blackbox authoring schema",
      description:
        "Document layout and the condition/effect/choice/node grammar for authoring Blackbox stories",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(SCHEMA_REFERENCE, null, 2),
        },
      ],
    }),
  );

  registerTool(
    "list_projects",
    {
      title: "List Blackbox projects",
      description: "List projects already registered in the running editor.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => jsonText({ projects: projectService.listProjects().map(publicProject) }),
  );

  registerTool(
    "describe_schema",
    {
      title: "Describe authoring schema",
      description:
        "Return the Blackbox authoring grammar: document layout plus the node, text block, " +
        "choice, gate/condition, effect, action, and skill-check shapes. Read this before " +
        "writing content so conditions and effects are valid.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => jsonText(SCHEMA_REFERENCE),
  );

  registerTool(
    "read_project",
    {
      title: "Read project",
      description:
        "Read authored scenario, chapters, and catalogs. Layout and media are omitted unless requested.",
      inputSchema: {
        projectId: z.string().min(1),
        includeLayout: z.boolean().default(false),
        includeMedia: z.boolean().default(false),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId, includeLayout, includeMedia }) => {
      return jsonText(
        publicSnapshot(await readSnapshot(projectId), { includeLayout, includeMedia }),
      );
    },
  );

  registerTool(
    "get_node",
    {
      title: "Get story node",
      description:
        "Read one node by chapter and node ID. Use chapterId 'scenario' for legacy inline nodes.",
      inputSchema: {
        projectId: z.string().min(1),
        chapterId: z.string().min(1),
        nodeId: z.string().min(1),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId, chapterId, nodeId }) => {
      const snapshot = await readSnapshot(projectId);
      const result = findNode(snapshot, chapterId, nodeId);
      if (!result) {
        throw Object.assign(new Error(`Node not found: ${chapterId}/${nodeId}`), {
          code: "not_found",
        });
      }
      return jsonText({ revision: snapshot.project.revision, ...result });
    },
  );

  registerTool(
    "save_documents",
    {
      title: "Save project documents",
      description:
        "Atomically save one or more authored JSON documents. Requires the exact current project revision.",
      inputSchema: {
        projectId: z.string().min(1),
        expectedRevision: z.number().int().positive(),
        documents: z.record(z.string().min(1), z.unknown()),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ projectId, expectedRevision, documents }, _extra, auditDetails) => {
      mutationGuard(projectId);
      const before = await readSnapshot(projectId);
      const changeSummary = summarizeDocumentChanges(before, documents);
      const saved = await projectService.saveDocuments(projectId, {
        baseRevision: expectedRevision,
        documents,
        force: false,
        clientId: "mcp",
        event: mutationEvent(changeSummary),
      });
      Object.assign(auditDetails, changeSummary, { revision: saved.revision });
      return jsonText(saved);
    },
  );

  registerTool(
    "patch_documents",
    {
      title: "Patch project documents",
      description:
        "Apply targeted, id-addressed edits without re-sending whole documents. " +
        "Each op touches one node, choice, or catalog record; only the affected " +
        "documents are rewritten atomically. Requires the exact current revision. " +
        "Use chapterId 'scenario' for legacy inline nodes.",
      inputSchema: {
        projectId: z.string().min(1),
        expectedRevision: z.number().int().positive(),
        ops: z
          .array(
            z.discriminatedUnion("op", [
              z.object({
                op: z.literal("set_node"),
                chapterId: z.string().min(1),
                node: z.record(z.string(), z.unknown()),
              }),
              z.object({
                op: z.literal("remove_node"),
                chapterId: z.string().min(1),
                nodeId: z.string().min(1),
              }),
              z.object({
                op: z.literal("set_choice"),
                chapterId: z.string().min(1),
                nodeId: z.string().min(1),
                choice: z.record(z.string(), z.unknown()),
              }),
              z.object({
                op: z.literal("remove_choice"),
                chapterId: z.string().min(1),
                nodeId: z.string().min(1),
                choiceId: z.string().min(1),
              }),
              z.object({
                op: z.literal("set_record"),
                collection: z.enum(PATCH_COLLECTIONS),
                id: z.string().min(1),
                value: z.record(z.string(), z.unknown()),
              }),
              z.object({
                op: z.literal("remove_record"),
                collection: z.enum(PATCH_COLLECTIONS),
                id: z.string().min(1),
              }),
            ]),
          )
          .min(1)
          .max(MAX_PATCH_OPS),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ projectId, expectedRevision, ops }, _extra, auditDetails) => {
      mutationGuard(projectId);
      const before = await readSnapshot(projectId);
      const documents = applyDocumentPatch(before, ops);
      const changeSummary = summarizeDocumentChanges(before, documents);
      const saved = await projectService.saveDocuments(projectId, {
        baseRevision: expectedRevision,
        documents,
        force: false,
        clientId: "mcp",
        event: mutationEvent(changeSummary),
      });
      Object.assign(auditDetails, changeSummary, { revision: saved.revision });
      return jsonText({ ...saved, documentsWritten: Object.keys(documents) });
    },
  );

  registerTool(
    "add_chapter",
    {
      title: "Add a chapter",
      description:
        "Create a new chapter file with a start node and register it in scenario.json " +
        "atomically. Requires the exact current project revision. Reach it from an existing " +
        "choice with action { type: gotoChapter, chapterId }.",
      inputSchema: {
        projectId: z.string().min(1),
        expectedRevision: z.number().int().positive(),
        id: z.string().trim().min(1).max(80).regex(CHAPTER_ID_PATTERN, {
          message: "id may contain only letters, numbers, hyphen, and underscore",
        }),
        title: z.string().trim().min(1).max(200),
        startNodeId: z.string().trim().min(1).max(120).optional(),
        startNodeTitle: z.string().trim().min(1).max(200).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (
      { projectId, expectedRevision, id, title, startNodeId, startNodeTitle },
      _extra,
      auditDetails,
    ) => {
      mutationGuard(projectId);
      const before = await readSnapshot(projectId);
      const scenarioPath = before.bundle.filePaths?.scenario ?? "scenario.json";
      const scenario = structuredClone(before.bundle.scenario ?? {});
      const chapters = Array.isArray(scenario.chapters) ? scenario.chapters : [];
      const ref = `chapter_${id}.json`;

      if (chapters.some((entry) => entry?.id === id) || before.bundle.chapters?.[id]) {
        throw Object.assign(new Error(`Chapter already exists: ${id}`), { code: "chapter_exists" });
      }
      const usedRefs = new Set(Object.values(before.bundle.filePaths?.chapters ?? {}));
      if (usedRefs.has(ref) || chapters.some((entry) => entry?.ref === ref)) {
        throw Object.assign(new Error(`Chapter file already exists: ${ref}`), {
          code: "chapter_exists",
        });
      }

      const resolvedStartNodeId = startNodeId ?? `${id}_start`;
      const chapterDoc = newChapterDocument({
        id,
        title: startNodeTitle ?? title,
        startNodeId: resolvedStartNodeId,
      });
      chapterDoc.title = title;
      scenario.chapters = [...chapters, { id, title, ref }];

      const documents = { [ref]: chapterDoc, [scenarioPath]: scenario };
      const changeSummary = summarizeDocumentChanges(before, documents);
      const saved = await projectService.saveDocuments(projectId, {
        baseRevision: expectedRevision,
        documents,
        force: false,
        clientId: "mcp",
        event: mutationEvent(changeSummary),
      });
      Object.assign(auditDetails, changeSummary, { revision: saved.revision });
      return jsonText({
        revision: saved.revision,
        chapterId: id,
        ref,
        startNodeId: resolvedStartNodeId,
        documentsWritten: Object.keys(documents),
      });
    },
  );

  registerTool(
    "upload_media",
    {
      title: "Upload media asset",
      description:
        "Write a binary asset (base64) into textures, music, or sfx so authored " +
        "documents can reference it. Requires the exact current project revision.",
      inputSchema: {
        projectId: z.string().min(1),
        expectedRevision: z.number().int().positive(),
        targetDir: z.enum(["textures", "music", "sfx"]),
        filename: z.string().trim().min(1).max(160),
        dataBase64: z.string().min(1),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (
      { projectId, expectedRevision, targetDir, filename, dataBase64 },
      _extra,
      auditDetails,
    ) => {
      mutationGuard(projectId);
      const data = Buffer.from(dataBase64, "base64");
      if (data.length === 0) {
        throw Object.assign(new Error("dataBase64 did not decode to any bytes"), {
          code: "invalid_request",
        });
      }
      if (data.length > MAX_MEDIA_BYTES) {
        throw Object.assign(new Error(`Media exceeds the ${MAX_MEDIA_BYTES} byte limit`), {
          code: "payload_too_large",
        });
      }
      const result = await projectService.uploadMedia(projectId, {
        baseRevision: expectedRevision,
        targetDir,
        filename,
        data,
        clientId: "mcp",
      });
      Object.assign(auditDetails, { revision: result.revision, mediaPath: result.path });
      return jsonText({
        path: result.path,
        revision: result.revision,
        bytes: data.length,
        mediaCount: Array.isArray(result.mediaFiles) ? result.mediaFiles.length : undefined,
      });
    },
  );

  registerTool(
    "bundle_project",
    {
      title: "Build diagnostic bundle",
      description:
        "Run the bundler at the exact requested revision to surface build errors and " +
        "missing assets. Output is discarded — nothing is written into the project.",
      inputSchema: {
        projectId: z.string().min(1),
        expectedRevision: z.number().int().positive(),
        platform: z.string().min(1).optional(),
        ignoreMissing: z.boolean().default(false),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId, expectedRevision, platform, ignoreMissing }) => {
      await readSnapshot(projectId);
      return jsonText(
        await executeBundle(projectService, projectId, {
          expectedRevision,
          platform,
          ignoreMissing,
        }),
      );
    },
  );

  registerTool(
    "lint_project",
    {
      title: "Lint project",
      description: "Run Blackbox validation against the exact requested project revision.",
      inputSchema: {
        projectId: z.string().min(1),
        expectedRevision: z.number().int().positive(),
        ignore: z.array(z.string()).default([]),
        only: z.array(z.string()).default([]),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId, expectedRevision, ignore, only }) => {
      await readSnapshot(projectId);
      return jsonText(
        await executeLinter(projectService, projectId, {
          expectedRevision,
          ignore,
          only,
        }),
      );
    },
  );

  registerTool(
    "simulate_project",
    {
      title: "Simulate project",
      description: "Explore story reachability and endings at the exact requested revision.",
      inputSchema: {
        projectId: z.string().min(1),
        expectedRevision: z.number().int().positive(),
        mode: z.enum(["goals", "explore"]).default("goals"),
        goals: z.string().default("ending"),
        goalBudget: z.number().int().positive().default(50_000),
        maxStates: z.number().int().positive().default(500_000),
        threads: z.number().int().nonnegative().default(0),
        heuristic: z.enum(["graph", "none"]).default("graph"),
        check: z.boolean().default(true),
        analytics: z.boolean().default(false),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (options) => {
      await readSnapshot(options.projectId);
      return jsonText(
        await executeSimulator(projectService, options.projectId, {
          expectedRevision: options.expectedRevision,
          mode: options.mode,
          goals: options.goals,
          goalBudget: options.goalBudget,
          maxStates: options.maxStates,
          threads: options.threads,
          heuristic: options.heuristic,
          check: options.check,
          analytics: options.analytics,
        }),
      );
    },
  );

  registerTool(
    "search_project",
    {
      title: "Search project",
      description:
        "Fuzzy search across every project entity — nodes, chapters, items, characters, flags, events, and assets — powered by blackbox-scout. Each hit carries a `patch` locator giving the exact patch_documents address (set_node chapterId/nodeId, or set_record collection/id) so you can jump straight from a match to a targeted edit. Use `only` to restrict categories; pass an empty query to list everything. Set `fullText` to also match body text (node prose, choice labels, descriptions, subtitles), returning a `snippet` of the matched text.",
      inputSchema: {
        projectId: z.string().min(1),
        query: z.string().default(""),
        only: z
          .array(
            z.enum([
              "node",
              "chapter",
              "item",
              "character",
              "flag",
              "event",
              "texture",
              "music",
              "sfx",
              "asset",
            ]),
          )
          .default([]),
        fullText: z.boolean().default(false),
        limit: z.number().int().positive().max(500).default(50),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId, query, only, limit, fullText }) => {
      const snapshot = await readSnapshot(projectId);
      const run = await executeScout(projectService, projectId, { query, only, limit, fullText });
      if (!run.ok || !run.parsed) {
        return jsonText({ ok: false, query, error: run.raw?.stderr?.trim() || "scout failed" });
      }
      const results = (run.parsed.results ?? []).map((hit) => ({
        category: hit.category,
        id: hit.id,
        label: hit.label,
        chapter: hit.chapter ?? null,
        scenario: hit.scenario,
        ...(hit.snippet ? { snippet: hit.snippet } : {}),
        patch: scoutPatchLocator(hit),
      }));
      return jsonText({
        revision: snapshot.project.revision,
        query,
        count: results.length,
        results,
      });
    },
  );

  return server;
}
