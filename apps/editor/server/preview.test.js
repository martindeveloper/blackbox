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

  const writeProject = async (folder, { localUi = false } = {}) => {
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
    if (localUi) {
      const src = path.join(projectPath, "src");
      await fs.mkdir(src, { recursive: true });
      await fs.writeFile(
        path.join(src, "game.ts"),
        `import type { GameDefinition } from "@engine/boot.js";
import { App } from "./App.js";
export const game: GameDefinition = { id: "${folder}", App, i18nResources: {}, player: {} };
`,
      );
      await fs.writeFile(
        path.join(src, "App.tsx"),
        `import { TextGamePlayerApp } from "@engine/ui/textGame/TextGamePlayerApp.js";
export function App() {
  return <TextGamePlayerApp config={{}} />;
}
`,
      );
      await fs.writeFile(path.join(src, "app.css"), "/* local ui */\n");
    }
  };

  await writeProject("has_local_ui", { localUi: true });
  await writeProject("no_local_ui");

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

async function trustProject(fastify, projectId) {
  const response = await fastify.inject({
    method: "POST",
    url: `/api/v1/projects/${projectId}/trust-ui`,
    payload: { trusted: true },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().trusted, true);
}

test("preview serves the project's local src/ UI when present", async () => {
  const env = await fixture();
  try {
    const id = env.idOf("has_local_ui");
    await trustProject(env.fastify, id);
    assert.equal(await previewAssets(env.fastify, id), id);
  } finally {
    await env.close();
  }
});

test("preview uses the generic shell until local UI is trusted", async () => {
  const env = await fixture();
  try {
    assert.equal(await previewAssets(env.fastify, env.idOf("has_local_ui")), "editor-preview");
  } finally {
    await env.close();
  }
});

test("preview falls back to the generic shell when src/ is absent", async () => {
  const env = await fixture();
  try {
    assert.equal(await previewAssets(env.fastify, env.idOf("no_local_ui")), "editor-preview");
  } finally {
    await env.close();
  }
});

test("preview falls back to the generic shell for an unknown project", async () => {
  const env = await fixture();
  try {
    assert.equal(await previewAssets(env.fastify, "does-not-exist"), "editor-preview");
  } finally {
    await env.close();
  }
});

test("on-demand build compiles and serves the project's local UI, then caches", async () => {
  const env = await fixture();
  try {
    const id = env.idOf("has_local_ui");
    await trustProject(env.fastify, id);
    const first = await env.fastify.inject({
      method: "GET",
      url: `/api/v1/projects/${id}/preview-build`,
    });
    assert.equal(first.statusCode, 200);
    const firstBody = first.json();
    assert.equal(firstBody.game, id);

    const asset = await env.fastify.inject({
      method: "GET",
      url: `/preview/${id}/preview.js`,
    });
    assert.equal(asset.statusCode, 200);
    assert.ok(asset.body.length > 1000, "bundle is non-trivial");
    assert.ok(asset.body.includes("has_local_ui"), "bundle contains the game id");

    const second = await env.fastify.inject({
      method: "GET",
      url: `/api/v1/projects/${id}/preview-build`,
    });
    assert.equal(second.json().cached, true);

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
