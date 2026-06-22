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

test("patch_documents and upload_media mutate through the revision-checked pipeline", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-mcp-patch-"));
  const auditLogPath = path.join(tempDir, "logs", "mcp-audit.jsonl");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  let revision = 7;
  const saves = [];
  const uploads = [];
  const service = {
    listProjects: () => [snapshot(revision).project],
    openProject: async () => snapshot(revision),
    saveDocuments: async (_id, payload) => {
      assert.equal(payload.baseRevision, revision);
      assert.equal(payload.force, false);
      assert.equal(payload.clientId, "mcp");
      saves.push(payload);
      revision += 1;
      return { revision };
    },
    uploadMedia: async (_id, payload) => {
      assert.equal(payload.baseRevision, revision);
      assert.equal(payload.clientId, "mcp");
      uploads.push(payload);
      revision += 1;
      return { path: `${payload.targetDir}/${payload.filename}`, revision, mediaFiles: [{}, {}] };
    },
  };

  const server = new EditorMcpServer({ projectService: service, auditLogPath });
  const status = await server.start();
  t.after(() => server.stop());

  const client = new Client({ name: "patch-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(status.endpoint), {
    requestInit: { headers: { Authorization: `Bearer ${status.token}` } },
  });
  await client.connect(transport);
  t.after(() => client.close());

  const tools = await client.listTools();
  for (const name of ["patch_documents", "upload_media", "bundle_project"]) {
    assert.ok(
      tools.tools.some((tool) => tool.name === name),
      `missing tool ${name}`,
    );
  }

  const patched = await client.callTool({
    name: "patch_documents",
    arguments: {
      projectId: "project-1",
      expectedRevision: 7,
      ops: [
        { op: "set_node", chapterId: "intro", node: { id: "vault", title: "Vault", choices: [] } },
        {
          op: "set_choice",
          chapterId: "intro",
          nodeId: "start",
          choice: { id: "go", label: "Go", goto: "vault" },
        },
      ],
    },
  });
  assert.equal(patched.isError, undefined);
  // Only the touched chapter is rewritten, and the untouched start node survives.
  assert.equal(saves.length, 1);
  assert.deepEqual(Object.keys(saves[0].documents), ["chapter_intro.json"]);
  assert.ok(saves[0].documents["chapter_intro.json"].nodes.start);
  assert.equal(saves[0].documents["chapter_intro.json"].nodes.vault.title, "Vault");
  assert.match(patched.content[0].text, /chapter_intro\.json/);

  const uploaded = await client.callTool({
    name: "upload_media",
    arguments: {
      projectId: "project-1",
      expectedRevision: 8,
      targetDir: "textures",
      filename: "door.png",
      dataBase64: Buffer.from("PNGDATA").toString("base64"),
    },
  });
  assert.equal(uploaded.isError, undefined);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].targetDir, "textures");
  assert.ok(Buffer.isBuffer(uploads[0].data));
  assert.equal(uploads[0].data.toString(), "PNGDATA");

  // Patch ops that address a missing entity surface a coded error, not a clobber.
  const missing = await client.callTool({
    name: "patch_documents",
    arguments: {
      projectId: "project-1",
      expectedRevision: 9,
      ops: [{ op: "remove_node", chapterId: "intro", nodeId: "ghost" }],
    },
  });
  assert.equal(missing.isError, true);
  assert.match(missing.content[0].text, /not_found/);
  assert.equal(saves.length, 1);

  const audit = await server.readAudit();
  const patchEntry = audit.entries.find(
    (entry) => entry.tool === "patch_documents" && entry.outcome === "success" && entry.changeCount,
  );
  assert.deepEqual(patchEntry.arguments.opTypes, ["set_node", "set_choice"]);
  assert.equal(patchEntry.arguments.opCount, 2);
  // Audit records structural changes but never node titles or other content.
  assert.equal(JSON.stringify(audit.entries).includes("Vault"), false);
});

test("only upload_media may use the larger request-body budget", async (t) => {
  const service = {
    listProjects: () => [],
    openProject: async () => snapshot(),
    saveDocuments: async () => ({ revision: 1 }),
    uploadMedia: async () => ({ path: "textures/x.png", revision: 1, mediaFiles: [] }),
  };
  const server = new EditorMcpServer({ projectService: service });
  const status = await server.start();
  t.after(() => server.stop());

  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    Authorization: `Bearer ${status.token}`,
  };
  // ~3 MB payload: over the 2 MB authored-edit cap, well under the 32 MB upload cap.
  const pad = "x".repeat(3 * 1024 * 1024);
  const call = (name, args) =>
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    });

  const rejected = await fetch(status.endpoint, {
    method: "POST",
    headers,
    body: call("save_documents", {
      projectId: "project-1",
      expectedRevision: 1,
      documents: { "scenario.json": { pad } },
    }),
  });
  assert.equal(rejected.status, 413);

  const allowed = await fetch(status.endpoint, {
    method: "POST",
    headers,
    body: call("upload_media", {
      projectId: "project-1",
      expectedRevision: 1,
      targetDir: "textures",
      filename: "x.png",
      dataBase64: pad,
    }),
  });
  // The size gate let the oversized upload through (downstream status may vary).
  assert.notEqual(allowed.status, 413);
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
