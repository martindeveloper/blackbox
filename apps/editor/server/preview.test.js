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

test("on-demand build compiles and serves the game's real bundle, then caches", async () => {
  const env = await fixture();
  try {
    const id = env.idOf("declares_game");
    const first = await env.fastify.inject({
      method: "GET",
      url: `/api/v1/projects/${id}/preview-build`,
    });
    assert.equal(first.statusCode, 200);
    const firstBody = first.json();
    assert.equal(firstBody.game, "silent-archive");

    // The compiled asset is served from cache and contains the game's code.
    const asset = await env.fastify.inject({
      method: "GET",
      url: "/preview/silent-archive/preview.js",
    });
    assert.equal(asset.statusCode, 200);
    assert.ok(asset.body.length > 1000, "bundle is non-trivial");
    assert.ok(asset.body.includes("silent-archive"), "bundle contains the game");

    // Second build reuses the cache (no recompile).
    const second = await env.fastify.inject({
      method: "GET",
      url: `/api/v1/projects/${id}/preview-build`,
    });
    assert.equal(second.json().cached, true);

    // force=1 recompiles.
    const forced = await env.fastify.inject({
      method: "GET",
      url: `/api/v1/projects/${id}/preview-build?force=1`,
    });
    assert.equal(forced.json().cached, false);
  } finally {
    await env.close();
  }
});

test("preview asset route rejects invalid game segments and missing bundles", async () => {
  const env = await fixture();
  try {
    // `Bad_Name`/`UPPER` violate PREVIEW_GAME_PATTERN; `unbuilt-game` is valid
    // but has no cached file — all must 404 (never read outside PREVIEW_CACHE).
    for (const game of ["Bad_Name", "UPPER", "unbuilt-game"]) {
      const res = await env.fastify.inject({
        method: "GET",
        url: `/preview/${game}/style.css`,
      });
      assert.equal(res.statusCode, 404, `expected 404 for "${game}"`);
    }
  } finally {
    await env.close();
  }
});
