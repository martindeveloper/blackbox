import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { EditorMcpServer } from "./mcpServer.mjs";

function snapshot(revision = 7) {
  return {
    project: {
      id: "project-1",
      path: "/private/project",
      name: "story",
      title: "Story",
      revision,
      lastOpened: null,
      codeTrusted: false,
      hasCustomCode: false,
    },
    bundle: {
      scenarioName: "story",
      scenarioDir: "/private/project",
      folderName: "story",
      scenario: {
        spec: "com.blackbox.scenario",
        title: "Story",
        chapters: [{ id: "intro", title: "Intro", ref: "chapter_intro.json" }],
      },
      chapters: {
        intro: {
          id: "intro",
          title: "Intro",
          startNodeId: "start",
          nodes: {
            start: { id: "start", title: "Start", text: [], choices: [] },
          },
        },
      },
      chapterFiles: { intro: "chapter_intro.json" },
      items: { items: {} },
      characters: { characters: {} },
      assets: { textures: {}, music: {}, sfx: {} },
      meta: null,
      library: null,
      layout: { chapters: {} },
      filePaths: {
        scenario: "scenario.json",
        chapters: { intro: "chapter_intro.json" },
      },
    },
    mediaFiles: [],
    trashItems: [],
    rootFiles: [],
  };
}

test("serves authenticated MCP tools and revision-checked saves", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-mcp-audit-"));
  const auditLogPath = path.join(tempDir, "logs", "mcp-audit.jsonl");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  let dirty = false;
  let revision = 7;
  const saves = [];
  const service = {
    listProjects: () => [snapshot(revision).project],
    openProject: async () => snapshot(revision),
    saveDocuments: async (_id, payload) => {
      if (payload.baseRevision !== revision) {
        throw Object.assign(new Error("Project changed since it was loaded"), {
          code: "revision_conflict",
          details: { currentRevision: revision },
        });
      }
      saves.push(payload);
      revision += 1;
      return { revision };
    },
  };

  const server = new EditorMcpServer({
    projectService: service,
    isRendererDirty: () => dirty,
    auditLogPath,
  });
  const firstStatus = await server.start();
  t.after(() => server.stop());

  const unauthorized = await fetch(firstStatus.endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(unauthorized.status, 401);

  const client = new Client({ name: "blackbox-editor-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(firstStatus.endpoint), {
    requestInit: {
      headers: { Authorization: `Bearer ${firstStatus.token}` },
    },
  });
  await client.connect(transport);
  t.after(() => client.close());

  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === "read_project"));
  assert.ok(tools.tools.some((tool) => tool.name === "save_documents"));

  const project = await client.callTool({
    name: "read_project",
    arguments: { projectId: "project-1" },
  });
  assert.match(project.content[0].text, /chapter_intro\.json/);
  assert.doesNotMatch(project.content[0].text, /private\/project/);

  const saved = await client.callTool({
    name: "save_documents",
    arguments: {
      projectId: "project-1",
      expectedRevision: 7,
      documents: { "scenario.json": { title: "Updated" } },
    },
  });
  assert.equal(saved.isError, undefined);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].force, false);
  assert.equal(saves[0].clientId, "mcp");

  const expanded = await client.callTool({
    name: "save_documents",
    arguments: {
      projectId: "project-1",
      expectedRevision: 8,
      documents: {
        "chapter_intro.json": {
          spec: "com.blackbox.chapter",
          id: "intro",
          title: "Intro",
          startNodeId: "start",
          nodes: {
            start: {
              id: "start",
              title: "Start",
              text: [],
              choices: [{ id: "window", label: "Look out", goto: "vault" }],
            },
            vault: { id: "vault", title: "Vault", text: [], choices: [] },
          },
        },
        "items.json": {
          spec: "com.blackbox.items",
          formatVersion: 1,
          items: { archive_note: { id: "archive_note", name: "Archive Note" } },
        },
        "catalog.json": {
          spec: "com.blackbox.catalog",
          formatVersion: 1,
          events: { found_corridor: {} },
          flags: { saw_light: {} },
        },
      },
    },
  });
  assert.equal(expanded.isError, undefined);

  dirty = true;
  const blocked = await client.callTool({
    name: "save_documents",
    arguments: {
      projectId: "project-1",
      expectedRevision: 9,
      documents: { "scenario.json": { title: "Blocked" } },
    },
  });
  assert.equal(blocked.isError, true);
  assert.match(blocked.content[0].text, /editor_dirty/);
  assert.equal(saves.length, 2);

  const audit = await server.readAudit();
  const savedAudit = audit.entries.find((entry) => entry.changeCount === 5);
  assert.equal(audit.path, auditLogPath);
  assert.equal(savedAudit.client.name, "blackbox-editor-test");
  assert.deepEqual(savedAudit.arguments.documentPaths, [
    "chapter_intro.json",
    "items.json",
    "catalog.json",
  ]);
  assert.deepEqual(savedAudit.changes, [
    {
      action: "added",
      entity: "choice",
      id: "window",
      parentId: "start",
      chapterId: "intro",
    },
    { action: "added", entity: "node", id: "vault", chapterId: "intro" },
    { action: "added", entity: "item", id: "archive_note" },
    { action: "added", entity: "event", id: "found_corridor" },
    { action: "added", entity: "flag", id: "saw_light" },
  ]);
  assert.equal(savedAudit.revision, 9);
  assert.equal(JSON.stringify(audit.entries).includes("Look out"), false);
  assert.equal(JSON.stringify(audit.entries).includes("Archive Note"), false);
});

test("disabling MCP closes the endpoint and rotates credentials on restart", async () => {
  const service = {
    listProjects: () => [],
  };
  const server = new EditorMcpServer({ projectService: service });
  const first = await server.start();
  await server.stop();
  assert.equal(server.status().enabled, false);
  const second = await server.start();
  assert.notEqual(second.token, first.token);
  assert.notEqual(second.endpoint, null);
  await server.stop();
});
