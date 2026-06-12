import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Fastify from "fastify";
import {
  HEATMAP_PATH,
  LAYOUT_PATH,
  TOOL_RUNS_DIR,
  TOOL_RUNS_PATH,
} from "../shared/blackboxPaths.js";
import { registerRoutes } from "./routes.js";
import { ProjectError, ProjectService } from "./projectService.js";

function analyticsFixture() {
  const traffic = {
    id: "start",
    visits: 1,
    reach: 1,
    reachPct: 100,
    outDegree: 1,
  };
  return {
    mandatoryNodes: ["start"],
    totalEndings: 1,
    nodeImportance: [{ id: "start", count: 1, total: 1, pct: 100 }],
    importance: [],
    totalPaths: 1,
    accessibility: [{ id: "ending", count: 1, total: 1, pct: 100 }],
    nodeTraffic: [traffic],
    hotNodes: [traffic],
    splitCandidates: [traffic],
    perEnding: [{ ending: "ending", pathCount: 1, nodes: [] }],
  };
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-project-service-"));
  const projectsRoot = path.join(root, "data");
  const projectPath = path.join(projectsRoot, "test_project");
  await fs.mkdir(projectPath, { recursive: true });
  const write = (name, value) =>
    fs.writeFile(path.join(projectPath, name), `${JSON.stringify(value, null, 2)}\n`);
  await Promise.all([
    write("scenario.json", {
      spec: "com.blackbox.scenario",
      formatVersion: 1,
      title: "Test Project",
      itemsRef: "items.json",
      charactersRef: "characters.json",
      assetsRef: "assets.json",
      chapters: [{ id: "one", title: "One", ref: "chapter.json" }],
    }),
    write("items.json", { spec: "com.blackbox.items", formatVersion: 1, items: {} }),
    write("characters.json", {
      spec: "com.blackbox.characters",
      formatVersion: 1,
      characters: {},
    }),
    write("assets.json", {
      spec: "com.blackbox.assets.bundle",
      formatVersion: 1,
      textures: {},
      music: {},
      sfx: {},
    }),
    write("chapter.json", {
      spec: "com.blackbox.chapter",
      formatVersion: 1,
      id: "one",
      title: "One",
      startNodeId: "start",
      nodes: { start: { id: "start", title: "Start", text: [], choices: [] } },
    }),
  ]);
  const service = new ProjectService({
    roots: [projectsRoot],
    dbPath: path.join(root, "editor.db"),
  });
  await service.start();
  return {
    root,
    projectPath,
    service,
    async close() {
      await service.close();
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

test("discovers, opens, and revision-saves a project", async () => {
  const env = await fixture();
  try {
    const [project] = env.service.listProjects();
    assert.ok(project);
    const snapshot = await env.service.openProject(project.id);
    assert.equal(snapshot.bundle.scenario.title, "Test Project");

    const result = await env.service.saveDocuments(project.id, {
      baseRevision: snapshot.project.revision,
      documents: {
        "scenario.json": { ...snapshot.bundle.scenario, title: "Changed" },
        [LAYOUT_PATH]: { chapters: { one: { nodes: {} } } },
      },
    });
    assert.equal(result.revision, snapshot.project.revision + 1);
    assert.equal((await env.service.openProject(project.id)).bundle.scenario.title, "Changed");

    await assert.rejects(
      env.service.saveDocuments(project.id, {
        baseRevision: snapshot.project.revision,
        documents: { "scenario.json": snapshot.bundle.scenario },
      }),
      (error) => error instanceof ProjectError && error.code === "revision_conflict",
    );
  } finally {
    await env.close();
  }
});

test("ignores persisted tool runs during project watching and indexing", async () => {
  const env = await fixture();
  try {
    const [summary] = env.service.listProjects();
    const project = env.service.requireProject(summary.id);
    await env.service.watchers.get(project.id)?.close();
    env.service.watchers.delete(project.id);
    const initialRevision = project.revision;
    const runPath = path.join(project.path, TOOL_RUNS_PATH);
    const temporaryPath = `${runPath}.atomic-write.tmp`;

    await fs.mkdir(path.dirname(runPath), { recursive: true });
    await fs.writeFile(runPath, "{}\n");
    await fs.writeFile(temporaryPath, "{}\n");

    await env.service.onExternalChange(project, runPath);
    await env.service.onExternalChange(project, temporaryPath);
    await env.service.indexProject(project);

    assert.equal(project.revision, initialRevision);
    const indexedSidecars = env.service.db
      .prepare("SELECT path FROM files WHERE project_id = ? AND path LIKE ?")
      .all(project.id, `${TOOL_RUNS_DIR}/%`);
    assert.deepEqual(indexedSidecars, []);
  } finally {
    await env.close();
  }
});

test("rejects traversal and symlink escapes", async () => {
  const env = await fixture();
  try {
    const [project] = env.service.listProjects();
    assert.throws(
      () => env.service.resolvePath(env.service.requireProject(project.id), "../outside.json"),
      (error) => error instanceof ProjectError && error.code === "invalid_path",
    );

    const outside = path.join(env.root, "outside");
    await fs.mkdir(outside);
    await fs.symlink(outside, path.join(env.projectPath, "escape"));
    assert.throws(
      () => env.service.resolvePath(env.service.requireProject(project.id), "escape/file.json"),
      (error) => error instanceof ProjectError && error.code === "invalid_path",
    );
  } finally {
    await env.close();
  }
});

test("regenerates a copied project ID", async () => {
  const env = await fixture();
  try {
    const [first] = env.service.listProjects();
    const copiedPath = path.join(path.dirname(env.projectPath), "copied_project");
    await fs.cp(env.projectPath, copiedPath, { recursive: true });
    const copied = await env.service.registerProject(copiedPath);
    assert.notEqual(copied.id, first.id);
    assert.equal(env.service.listProjects().length, 2);
  } finally {
    await env.close();
  }
});

test("serves image bytes and audio ranges through the API", async () => {
  const env = await fixture();
  const app = Fastify();
  try {
    const [project] = env.service.listProjects();
    await fs.mkdir(path.join(env.projectPath, "textures"), { recursive: true });
    await fs.mkdir(path.join(env.projectPath, "music"), { recursive: true });
    await fs.writeFile(path.join(env.projectPath, "textures", "preview.png"), Buffer.from("image"));
    await fs.writeFile(
      path.join(env.projectPath, "music", "preview.mp3"),
      Buffer.from("0123456789"),
    );
    await app.register(async (routes) => registerRoutes(routes, env.service), {
      prefix: "/api/v1",
    });

    const image = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/media/textures/preview.png`,
    });
    assert.equal(image.statusCode, 200);
    assert.equal(image.headers["content-type"], "image/png");
    assert.equal(image.rawPayload.toString(), "image");

    const audio = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/media/music/preview.mp3`,
      headers: { range: "bytes=2-5" },
    });
    assert.equal(audio.statusCode, 206);
    assert.equal(audio.headers["content-range"], "bytes 2-5/10");
    assert.equal(audio.rawPayload.toString(), "2345");
  } finally {
    await app.close();
    await env.close();
  }
});

test("stores a versioned heatmap and detects narrative changes", async () => {
  const env = await fixture();
  try {
    const [project] = env.service.listProjects();
    const saved = await env.service.writeHeatmap(project.id, {
      analytics: analyticsFixture(),
      meta: { mode: "explore" },
      capturedAt: 123,
      sourceRevision: project.revision,
      scenarioRevision: "1.0",
    });
    assert.equal(saved.stored.version, 2);

    await fs.writeFile(
      path.join(env.projectPath, "chapter.json"),
      `${JSON.stringify({ changed: true })}\n`,
    );
    const loaded = await env.service.readHeatmap(project.id);
    assert.equal(loaded.stale, true);
  } finally {
    await env.close();
  }
});

test("ignores malformed persisted heatmaps", async () => {
  const env = await fixture();
  try {
    const [project] = env.service.listProjects();
    const heatmapPath = path.join(env.projectPath, HEATMAP_PATH);
    await fs.mkdir(path.dirname(heatmapPath), { recursive: true });
    await fs.writeFile(heatmapPath, '{"analytics":{"hotNodes":"invalid"}}\n');

    const loaded = await env.service.readHeatmap(project.id);
    assert.equal(loaded.stored, null);
  } finally {
    await env.close();
  }
});
