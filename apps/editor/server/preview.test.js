import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createEditorServer } from "./app.js";
import { ProjectService } from "./projectService.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-preview-"));
  const projectsRoot = path.join(root, "data");

  const writeProject = async (folder, scenarioExtra) => {
    const projectPath = path.join(projectsRoot, folder);
    await fs.mkdir(projectPath, { recursive: true });
    const write = (name, value) =>
      fs.writeFile(path.join(projectPath, name), `${JSON.stringify(value, null, 2)}\n`);
    await Promise.all([
      write("scenario.json", {
        spec: "com.blackbox.scenario",
        formatVersion: 1,
        title: folder,
        itemsRef: "items.json",
        charactersRef: "characters.json",
        assetsRef: "assets.json",
        chapters: [{ id: "one", title: "One", ref: "chapter.json" }],
        ...scenarioExtra,
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
  };

  await writeProject("declares_game", { game: "silent-archive" });
  await writeProject("no_game", {});
  await writeProject("ghost_game", { game: "not-built" });

  const service = new ProjectService({
    roots: [projectsRoot],
    dbPath: path.join(root, "editor.db"),
  });
  await service.start();
  const { fastify } = await createEditorServer({ projectService: service });
  await fastify.ready();

  const idOf = (folder) =>
    service.listProjects().find((project) => project.name === folder)?.id ?? null;

  return {
    fastify,
    idOf,
    async close() {
      await fastify.close();
      await service.close();
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

async function previewAssets(fastify, projectId) {
  const query = projectId ? `?project=${encodeURIComponent(projectId)}` : "";
  const res = await fastify.inject({ method: "GET", url: `/preview${query}` });
  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.includes("__GAME__"), "placeholder must be substituted");
  const match = res.body.match(/\/preview\/([^/]+)\/preview\.js/);
  assert.ok(match, "preview script path present");
  return match[1];
}

test("preview serves the project's declared game bundle", async () => {
  const env = await fixture();
  try {
    assert.equal(await previewAssets(env.fastify, env.idOf("declares_game")), "silent-archive");
  } finally {
    await env.close();
  }
});

test("preview falls back to the generic game when none is declared", async () => {
  const env = await fixture();
  try {
    assert.equal(await previewAssets(env.fastify, env.idOf("no_game")), "editor-preview");
  } finally {
    await env.close();
  }
});

test("preview falls back when the declared game bundle is not built", async () => {
  const env = await fixture();
  try {
    assert.equal(await previewAssets(env.fastify, env.idOf("ghost_game")), "editor-preview");
  } finally {
    await env.close();
  }
});

test("preview falls back to the generic game for an unknown project", async () => {
  const env = await fixture();
  try {
    assert.equal(await previewAssets(env.fastify, "does-not-exist"), "editor-preview");
  } finally {
    await env.close();
  }
});
