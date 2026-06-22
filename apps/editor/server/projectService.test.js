import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Fastify from "fastify";
import {
  EDITOR_SIDECAR_DIR,
  HEATMAP_PATH,
  BUILD_DIR,
  CACHE_DIR,
  CHECKPOINTS_DIR,
  LAYOUT_PATH,
  PROJECT_CONFIG_BASENAME,
  PROJECT_CONFIG_PATH,
  TOOL_RUNS_DIR,
  TOOL_RUNS_PATH,
} from "../shared/blackboxPaths.js";
import { EDITOR_VERSION } from "../shared/editorVersion.js";
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

async function fixture(options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-project-service-"));
  const projectsRoot = path.join(root, "data");
  const projectPath = path.join(projectsRoot, "test_project");
  const trashedPaths = [];
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
    trashItem:
      options.trashItem ??
      (async (target) => {
        const destination = path.join(root, `trashed-${path.basename(target)}`);
        await fs.rename(target, destination);
        trashedPaths.push(destination);
      }),
  });
  await service.start();
  return {
    root,
    projectPath,
    trashedPaths,
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
    env.service.setProjectCodeTrust(project.id, false);
    const snapshot = await env.service.openProject(project.id);
    assert.equal(snapshot.bundle.scenario.title, "Test Project");
    const events = [];
    const unsubscribe = env.service.subscribe(project.id, (event) => events.push(event));

    const result = await env.service.saveDocuments(project.id, {
      baseRevision: snapshot.project.revision,
      documents: {
        "scenario.json": { ...snapshot.bundle.scenario, title: "Changed" },
        [LAYOUT_PATH]: { chapters: { one: { nodes: {} } } },
      },
      clientId: "git-sync",
      event: {
        source: "git",
        contribution: {
          status: "applied",
          contributor: { kind: "person", name: "Test Author" },
          changes: [{ action: "edited", entity: "node", id: "start", chapterId: "one" }],
          changeCount: 1,
          review: { type: "git-diff", from: "abc", to: "def" },
        },
      },
    });
    unsubscribe();
    assert.equal(result.revision, snapshot.project.revision + 1);
    assert.equal(events[0].source, "git");
    assert.equal(events[0].clientId, "git-sync");
    assert.equal(events[0].contribution.contributor.name, "Test Author");
    assert.equal(events[0].contribution.changes[0].id, "start");
    assert.equal(events[0].contribution.review.type, "git-diff");
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

test("ignores generated build/cache output during watching and indexing", async () => {
  const env = await fixture();
  try {
    const [summary] = env.service.listProjects();
    const project = env.service.requireProject(summary.id);
    await env.service.watchers.get(project.id)?.close();
    env.service.watchers.delete(project.id);
    const initialRevision = project.revision;

    // A clean Android build wipes and regenerates the whole Gradle project under
    // .blackbox/build/<config>; none of those writes (nor .git churn) are
    // authored content.
    const buildFile = path.join(project.path, BUILD_DIR, "debug", "android", "gradlew");
    const cacheFile = path.join(project.path, CACHE_DIR, "wasm", "client.wasm");
    const gitFile = path.join(project.path, ".git", "objects", "ab", "cdef");
    for (const target of [buildFile, cacheFile, gitFile]) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, "x");
      await env.service.onExternalChange(project, target);
    }
    await env.service.indexProject(project);

    assert.equal(project.revision, initialRevision);
    const indexedGenerated = env.service.db
      .prepare(
        "SELECT path FROM files WHERE project_id = ? AND (path LIKE ? OR path LIKE ? OR path LIKE ?)",
      )
      .all(project.id, `${BUILD_DIR}/%`, `${CACHE_DIR}/%`, ".git/%");
    assert.deepEqual(indexedGenerated, []);
  } finally {
    await env.close();
  }
});

test("suppresses every watcher event from a single atomic save, not just the first", async () => {
  const env = await fixture();
  try {
    const [summary] = env.service.listProjects();
    const project = env.service.requireProject(summary.id);
    // Drive onExternalChange directly so the real chokidar watcher does not
    // race the assertions.
    await env.service.watchers.get(project.id)?.close();
    env.service.watchers.delete(project.id);

    const events = [];
    const unsubscribe = env.service.subscribe(project.id, (event) => events.push(event));
    const revisionAfterSave = project.revision;
    const scenarioPath = path.join(project.path, "scenario.json");

    // An atomic overwrite of an existing file fires more than one watcher event
    // on the same path (unlink as the original moves to its backup, then add as
    // the temp file is renamed into place). The save suppresses the path once.
    env.service.suppress(scenarioPath);
    await env.service.onExternalChange(project, scenarioPath); // unlink
    await env.service.onExternalChange(project, scenarioPath); // add

    assert.equal(
      project.revision,
      revisionAfterSave,
      "self-inflicted writes must not bump revision",
    );
    assert.deepEqual(
      events.filter((event) => event.source === "external"),
      [],
      "an editor save must not surface as an external change",
    );

    // A genuine external change after the suppression window still registers.
    await new Promise((resolve) => setTimeout(resolve, 1600));
    await env.service.onExternalChange(project, scenarioPath);
    assert.equal(project.revision, revisionAfterSave + 1);
    assert.equal(events.at(-1)?.source, "external");

    unsubscribe();
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

test("standalone mode registers projects outside configured roots", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-standalone-"));
  const projectsRoot = path.join(root, "data");
  const outsideRoot = path.join(root, "outside");
  await fs.mkdir(outsideRoot, { recursive: true });
  await fs.writeFile(
    path.join(outsideRoot, "scenario.json"),
    `${JSON.stringify({
      spec: "com.blackbox.scenario",
      formatVersion: 1,
      title: "Outside Project",
      itemsRef: "items.json",
      charactersRef: "characters.json",
      assetsRef: "assets.json",
      chapters: [{ id: "one", title: "One", ref: "chapter.json" }],
    })}\n`,
  );

  const restricted = new ProjectService({
    roots: [projectsRoot],
    dbPath: path.join(root, "restricted.db"),
  });
  const standalone = new ProjectService({
    roots: [projectsRoot],
    dbPath: path.join(root, "standalone.db"),
    standalone: true,
  });

  try {
    await restricted.start();
    await standalone.start();

    await assert.rejects(
      restricted.registerProject(outsideRoot),
      (error) =>
        error instanceof ProjectError &&
        error.code === "invalid_project" &&
        error.message === "Project is outside configured roots",
    );

    const project = await standalone.registerProject(outsideRoot);
    assert.equal(await fs.realpath(project.path), await fs.realpath(outsideRoot));
    assert.ok(standalone.roots.includes(await fs.realpath(outsideRoot)));
  } finally {
    await restricted.close();
    await standalone.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("requires and persists a trust decision before opening any project", async () => {
  const env = await fixture();
  let reopened = null;

  try {
    const [project] = env.service.listProjects();
    await assert.rejects(
      env.service.openProject(project.id),
      (error) => error instanceof ProjectError && error.code === "project_trust_required",
    );

    env.service.setProjectCodeTrust(project.id, false);
    await env.service.openProject(project.id);

    reopened = new ProjectService({
      roots: [path.dirname(env.projectPath)],
      dbPath: path.join(env.root, "editor.db"),
    });
    await reopened.start();

    const [persisted] = reopened.listProjects();
    await reopened.openProject(persisted.id);
  } finally {
    await reopened?.close();
    await env.close();
  }
});

test("warns before opening with a different editor version and updates on acceptance", async () => {
  const env = await fixture();

  try {
    const [project] = env.service.listProjects();
    env.service.setProjectCodeTrust(project.id, false);

    await env.service.openProject(project.id);
    const currentProjectDoc = JSON.parse(
      await fs.readFile(path.join(env.projectPath, PROJECT_CONFIG_PATH), "utf8"),
    );
    assert.equal(currentProjectDoc.editorVersion, EDITOR_VERSION);

    await fs.writeFile(
      path.join(env.projectPath, PROJECT_CONFIG_PATH),
      `${JSON.stringify({ ...currentProjectDoc, editorVersion: "0.0.1" }, null, 2)}\n`,
    );
    env.service.requireProject(project.id).editorVersion = "0.0.1";
    await assert.rejects(
      env.service.openProject(project.id),
      (error) =>
        error instanceof ProjectError &&
        error.code === "editor_version_mismatch" &&
        error.details.projectVersion === "0.0.1" &&
        error.details.editorVersion === EDITOR_VERSION,
    );
    assert.deepEqual(
      JSON.parse(await fs.readFile(path.join(env.projectPath, PROJECT_CONFIG_PATH), "utf8")),
      { ...currentProjectDoc, editorVersion: "0.0.1" },
    );

    await env.service.openProject(project.id, true);
    assert.deepEqual(
      JSON.parse(await fs.readFile(path.join(env.projectPath, PROJECT_CONFIG_PATH), "utf8")),
      { ...currentProjectDoc, editorVersion: EDITOR_VERSION },
    );
  } finally {
    await env.close();
  }
});

test("revokes all UI trust without removing recent projects", async () => {
  const env = await fixture();

  try {
    const [project] = env.service.listProjects();
    env.service.setProjectCodeTrust(project.id, true);
    await env.service.openProject(project.id);
    const before = env.service.listProjects();

    assert.deepEqual(env.service.revokeAllProjectCodeTrust(), { revoked: 1 });
    assert.deepEqual(env.service.revokeAllProjectCodeTrust(), { revoked: 0 });
    const after = env.service.listProjects();
    assert.equal(after.length, before.length);
    assert.equal(after[0].id, before[0].id);
    assert.equal(after[0].codeTrusted, null);
    await assert.rejects(
      env.service.openProject(project.id),
      (error) => error instanceof ProjectError && error.code === "project_trust_required",
    );
  } finally {
    await env.close();
  }
});

test("revokes UI trust through the projects API before reopening a recent project", async () => {
  const env = await fixture();
  const app = Fastify();

  try {
    const [project] = env.service.listProjects();
    env.service.setProjectCodeTrust(project.id, true);
    await env.service.openProject(project.id);
    await app.register(async (routes) => registerRoutes(routes, env.service), {
      prefix: "/api/v1",
    });

    const revoke = await app.inject({
      method: "POST",
      url: "/api/v1/projects/revoke-code-trust",
      payload: {},
    });
    assert.equal(revoke.statusCode, 200);
    assert.deepEqual(revoke.json(), { revoked: 1 });

    const reopen = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/open`,
      payload: {},
    });
    assert.equal(reopen.statusCode, 400);
    assert.equal(reopen.json().code, "project_trust_required");
    assert.equal(env.service.listProjects().length, 1);
  } finally {
    await app.close();
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

test("stores preview checkpoints under .blackbox/user/checkpoints", async () => {
  const env = await fixture();
  try {
    const [project] = env.service.listProjects();
    const payload = {
      storage: { "save-slot:0": { nodeId: "start" }, "last-used-slot": 0 },
      engineState: JSON.stringify({ protocol: 1, view: { node_id: "start" } }),
      nodeId: "start",
      chapterId: "one",
      location: "Hall",
    };
    const saved = await env.service.createPreviewCheckpoint(project.id, payload);
    assert.equal(saved.checkpoint.format, "blackbox-preview-checkpoint");
    assert.equal(saved.checkpoint.nodeId, "start");

    const listed = await env.service.listPreviewCheckpoints(project.id);
    assert.equal(listed.checkpoints.length, 1);
    assert.equal(listed.checkpoints[0].id, saved.checkpoint.id);

    const loaded = await env.service.readPreviewCheckpoint(project.id, saved.checkpoint.id);
    assert.equal(loaded.checkpoint.engineState, payload.engineState);

    await env.service.deletePreviewCheckpoint(project.id, saved.checkpoint.id);
    const afterDelete = await env.service.listPreviewCheckpoints(project.id);
    assert.equal(afterDelete.checkpoints.length, 0);

    const checkpointFile = path.join(
      env.projectPath,
      CHECKPOINTS_DIR,
      `${saved.checkpoint.id}.json`,
    );
    await assert.rejects(fs.access(checkpointFile));
  } finally {
    await env.close();
  }
});

test("re-registers a recreated project folder after the old path row is orphaned", async () => {
  const env = await fixture();
  try {
    const [first] = env.service.listProjects();
    const staleId = first.id;

    await fs.rm(env.projectPath, { recursive: true, force: true });
    await fs.mkdir(env.projectPath, { recursive: true });
    await fs.writeFile(
      path.join(env.projectPath, "scenario.json"),
      `${JSON.stringify({
        spec: "com.blackbox.scenario",
        formatVersion: 1,
        title: "Recreated",
        chapters: [{ id: "one", title: "One", ref: "chapter.json" }],
      })}\n`,
    );
    await fs.writeFile(
      path.join(env.projectPath, "chapter.json"),
      `${JSON.stringify({
        spec: "com.blackbox.chapter",
        formatVersion: 1,
        id: "one",
        title: "One",
        startNodeId: "start",
        nodes: { start: { id: "start", title: "Start", text: [], choices: [] } },
      })}\n`,
    );
    await fs.mkdir(path.join(env.projectPath, EDITOR_SIDECAR_DIR), { recursive: true });
    await fs.writeFile(
      path.join(env.projectPath, EDITOR_SIDECAR_DIR, PROJECT_CONFIG_BASENAME),
      `${JSON.stringify({ id: "newEditor01", editorVersion: EDITOR_VERSION })}\n`,
    );

    const recreated = await env.service.registerProject(env.projectPath);
    assert.equal(await fs.realpath(recreated.path), await fs.realpath(env.projectPath));
    assert.equal(recreated.id, "newEditor01");
    assert.notEqual(recreated.id, staleId);
    assert.equal(env.service.listProjects().length, 1);
    assert.equal(
      env.service.db
        .prepare("SELECT COUNT(*) AS count FROM projects WHERE path = ?")
        .get(recreated.path).count,
      1,
    );
  } finally {
    await env.close();
  }
});

test("deleteProject moves the project to trash and removes its registry entry", async () => {
  const env = await fixture();
  try {
    const [project] = env.service.listProjects();
    await env.service.deleteProject(project.id, project.name);
    assert.equal(env.service.listProjects().length, 0);
    await assert.rejects(fs.access(env.projectPath), (error) => error?.code === "ENOENT");
    assert.equal(env.trashedPaths.length, 1);
    await fs.access(env.trashedPaths[0]);
  } finally {
    await env.close();
  }
});

test("deleteProject keeps the project registered when moving to trash fails", async () => {
  const env = await fixture({
    trashItem: async () => {
      throw new Error("Trash is unavailable");
    },
  });
  try {
    const [project] = env.service.listProjects();
    await assert.rejects(
      env.service.deleteProject(project.id, project.name),
      (error) => error instanceof ProjectError && error.code === "project_trash_failed",
    );
    assert.equal(env.service.listProjects().length, 1);
    await fs.access(env.projectPath);
  } finally {
    await env.close();
  }
});

test("deleteProject requires matching folder name", async () => {
  const env = await fixture();
  try {
    const [project] = env.service.listProjects();
    await assert.rejects(
      env.service.deleteProject(project.id, "wrong-name"),
      (error) => error instanceof ProjectError && error.code === "invalid_request",
    );
    assert.equal(env.service.listProjects().length, 1);
  } finally {
    await env.close();
  }
});
