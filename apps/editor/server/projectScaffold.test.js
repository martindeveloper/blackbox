import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Fastify from "fastify";
import { registerRoutes } from "./routes.js";
import { ProjectService } from "./projectService.js";
import {
  DEFAULT_COOK_REF,
  DEFAULT_LIBRARY_REF,
  PROJECT_MEDIA_DIRS,
  bootstrapStarterCode,
  ensureDevTsconfig,
  ensureGameFontsCss,
  ensureProjectSidecars,
  writeNewProject,
} from "./projectScaffold.js";
import {
  exampleIntroChapterDoc,
  exampleItemsDoc,
  exampleMetaCatalogDoc,
  exampleSecondChapterDoc,
} from "./exampleContent.js";

test("ensureDevTsconfig writes a relative-extends config only inside a monorepo", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-tsconfig-"));
  try {
    // Standalone (non-developer) layout: no apps/web/tsconfig.game.json above.
    const standalone = path.join(root, "standalone-game");
    await fs.mkdir(standalone, { recursive: true });
    assert.equal(await ensureDevTsconfig(standalone), false);
    await assert.rejects(fs.access(path.join(standalone, "tsconfig.json")));

    // Monorepo (developer) layout: game at <monorepo>/data/<name>.
    await fs.mkdir(path.join(root, "apps", "web"), { recursive: true });
    await fs.writeFile(path.join(root, "apps", "web", "tsconfig.game.json"), "{}\n");
    const game = path.join(root, "data", "my-game");
    await fs.mkdir(game, { recursive: true });

    assert.equal(await ensureDevTsconfig(game), true);
    const written = await fs.readFile(path.join(game, "tsconfig.json"), "utf8");
    assert.match(written, /"extends": "\.\.\/\.\.\/apps\/web\/tsconfig\.game\.json"/);
    assert.match(written, /"include"/);

    // Idempotent: identical content is not rewritten.
    assert.equal(await ensureDevTsconfig(game), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("bootstrapStarterCode scaffolds a commented src/ starter without clobbering", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-bootstrap-"));
  const projectPath = path.join(root, "my_game");
  try {
    await fs.mkdir(projectPath, { recursive: true });

    const created = await bootstrapStarterCode(projectPath);
    assert.deepEqual(
      created.sort(),
      ["src/App.tsx", "src/README.md", "src/app.css", "src/fonts.css", "src/game.ts"].sort(),
    );

    const gameTs = await fs.readFile(path.join(projectPath, "src", "game.ts"), "utf8");
    // Game id derives from the folder name, and the entry point is documented.
    assert.match(gameTs, /id: "my_game"/);
    assert.match(gameTs, /GameDefinition/);
    const appTsx = await fs.readFile(path.join(projectPath, "src", "App.tsx"), "utf8");
    assert.match(appTsx, /TextGamePlayerApp/);

    // Existing files are preserved; only genuinely new files are reported.
    await fs.writeFile(path.join(projectPath, "src", "game.ts"), "// my edits\n");
    const second = await bootstrapStarterCode(projectPath);
    assert.equal(second.length, 0);
    assert.equal(
      await fs.readFile(path.join(projectPath, "src", "game.ts"), "utf8"),
      "// my edits\n",
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("example content forms a fully-connected, self-consistent two-chapter tour", () => {
  const intro = exampleIntroChapterDoc({
    id: "prologue",
    title: "Prologue",
    secondChapterId: "two",
  });
  const second = exampleSecondChapterDoc({ id: "two", introChapterId: "prologue" });
  const chapters = { prologue: intro, two: second };

  const allNodeIds = new Set();
  for (const chapter of Object.values(chapters)) {
    for (const [key, node] of Object.entries(chapter.nodes)) {
      assert.equal(node.id, key, `node key ${key} must match its id`);
      assert.equal(allNodeIds.has(key), false, `duplicate node id ${key}`);
      allNodeIds.add(key);
    }
    assert.ok(chapter.nodes[chapter.startNodeId], `${chapter.id} start node exists`);
  }

  // Every goto / skill-check / cross-chapter target resolves.
  for (const chapter of Object.values(chapters)) {
    for (const node of Object.values(chapter.nodes)) {
      for (const choice of node.choices ?? []) {
        for (const target of [
          choice.goto,
          choice.check?.onSuccess?.goto,
          choice.check?.onFailure?.goto,
        ]) {
          if (target) assert.ok(allNodeIds.has(target), `goto ${target} resolves`);
        }
        if (choice.action?.type === "gotoChapter") {
          const dest = chapters[choice.action.chapterId];
          assert.ok(dest, `gotoChapter ${choice.action.chapterId} exists`);
          if (choice.action.nodeId) {
            assert.ok(dest.nodes[choice.action.nodeId], `chapter target node exists`);
          }
        }
        if (choice.action?.type === "restartGame") {
          assert.ok(allNodeIds.has(choice.action.startNodeId), "restart node exists");
        }
      }
    }
  }

  // The tour demonstrates a game-over node and an ending node.
  const modes = Object.values(second.nodes).map((node) => node.mode);
  assert.ok(modes.includes("game_over"));
  assert.ok(modes.includes("ending"));

  // Referenced item / event / flag are defined in their catalogs.
  assert.ok(exampleItemsDoc().items.keycard);
  const meta = exampleMetaCatalogDoc();
  assert.ok(meta.events.arrived);
  assert.ok(meta.flags.explored);
});

test("example second-chapter id avoids colliding with the author's first chapter", () => {
  // When the author names their first chapter "two", the example shifts.
  const intro = exampleIntroChapterDoc({ id: "two", title: "Two", secondChapterId: "second" });
  const cont = intro.nodes.two_ready.choices.find((c) => c.action?.type === "gotoChapter");
  assert.equal(cont.action.chapterId, "second");
  assert.equal(cont.action.nodeId, "second_start");
});

test("writeNewProject scaffolds sidecars, library, cook rules, and media dirs", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-scaffold-"));
  const projectPath = path.join(root, "demo");
  try {
    await writeNewProject(projectPath, {
      title: "Demo",
      firstChapterId: "prologue",
      firstChapterTitle: "Prologue",
    });

    for (const file of [
      "items.json",
      "characters.json",
      "assets.json",
      "library.json",
      "bundle.cook.json",
      "scenario.json",
    ]) {
      await fs.access(path.join(projectPath, file));
    }

    for (const dir of PROJECT_MEDIA_DIRS) {
      const stat = await fs.stat(path.join(projectPath, dir));
      assert.ok(stat.isDirectory(), dir);
    }

    const scenario = JSON.parse(await fs.readFile(path.join(projectPath, "scenario.json"), "utf8"));
    assert.equal(scenario.itemsRef, "items.json");
    assert.equal(scenario.charactersRef, "characters.json");
    assert.equal(scenario.assetsRef, "assets.json");
    assert.equal(scenario.libraryRef, DEFAULT_LIBRARY_REF);
    assert.equal(scenario.cookRef, DEFAULT_COOK_REF);

    const library = JSON.parse(await fs.readFile(path.join(projectPath, "library.json"), "utf8"));
    assert.equal(library.spec, "com.blackbox.library");

    const cook = JSON.parse(await fs.readFile(path.join(projectPath, "bundle.cook.json"), "utf8"));
    assert.equal(cook.spec, "com.blackbox.bundle.cook");
    assert.ok(cook.patterns.length >= 3);

    const fontsCss = await fs.readFile(path.join(projectPath, "src", "fonts.css"), "utf8");
    assert.match(fontsCss, /README\.md#web-fonts/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("ensureGameFontsCss adds src/fonts.css when a custom UI shell exists", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-scaffold-fonts-"));
  const projectPath = path.join(root, "custom-ui");
  try {
    await fs.mkdir(path.join(projectPath, "src"), { recursive: true });
    await fs.writeFile(path.join(projectPath, "src", "game.ts"), "export const game = {};\n");

    assert.equal(await ensureGameFontsCss(projectPath), true);
    const fontsCss = await fs.readFile(path.join(projectPath, "src", "fonts.css"), "utf8");
    assert.match(fontsCss, /README\.md#web-fonts/);
    assert.equal(await ensureGameFontsCss(projectPath), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("ensureProjectSidecars repairs incomplete projects", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-scaffold-"));
  const projectPath = path.join(root, "partial");
  try {
    await fs.mkdir(projectPath, { recursive: true });
    await fs.writeFile(
      path.join(projectPath, "scenario.json"),
      `${JSON.stringify({
        spec: "com.blackbox.scenario",
        formatVersion: 1,
        title: "Partial",
        chapters: [{ id: "one", title: "One", ref: "chapter_one.json" }],
      })}\n`,
    );

    const scenario = await ensureProjectSidecars(projectPath);
    await fs.access(path.join(projectPath, "items.json"));
    await fs.access(path.join(projectPath, "characters.json"));
    await fs.access(path.join(projectPath, "assets.json"));
    await fs.access(path.join(projectPath, "library.json"));
    await fs.access(path.join(projectPath, "bundle.cook.json"));
    await fs.stat(path.join(projectPath, "music"));
    assert.equal(scenario.libraryRef, DEFAULT_LIBRARY_REF);
    assert.equal(scenario.cookRef, DEFAULT_COOK_REF);

    const patched = JSON.parse(await fs.readFile(path.join(projectPath, "scenario.json"), "utf8"));
    assert.equal(patched.libraryRef, DEFAULT_LIBRARY_REF);
    assert.equal(patched.cookRef, DEFAULT_COOK_REF);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("create route produces an openable project", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-create-"));
  const projectsRoot = path.join(root, "data");
  await fs.mkdir(projectsRoot, { recursive: true });
  const service = new ProjectService({
    roots: [projectsRoot],
    dbPath: path.join(root, "editor.db"),
  });
  const app = Fastify();
  try {
    await service.start();
    await app.register(async (routes) => registerRoutes(routes, service), { prefix: "/api/v1" });

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/projects/create",
      payload: {
        parentPath: projectsRoot,
        folderName: "fresh",
        title: "Fresh",
      },
    });
    assert.equal(created.statusCode, 200);
    const { project } = created.json();
    assert.ok(project.id);
    service.setProjectCodeTrust(project.id, false);

    const opened = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/open`,
    });
    assert.equal(opened.statusCode, 200);
    assert.equal(opened.json().bundle.scenario.title, "Fresh");
    assert.deepEqual(opened.json().bundle.items.items, {});
    assert.deepEqual(opened.json().bundle.library?.snippets ?? {}, {});
  } finally {
    await app.close();
    await service.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("create route with withExample scaffolds an openable two-chapter tour", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-create-example-"));
  const projectsRoot = path.join(root, "data");
  await fs.mkdir(projectsRoot, { recursive: true });
  const service = new ProjectService({
    roots: [projectsRoot],
    dbPath: path.join(root, "editor.db"),
  });
  const app = Fastify();
  try {
    await service.start();
    await app.register(async (routes) => registerRoutes(routes, service), { prefix: "/api/v1" });

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/projects/create",
      payload: {
        parentPath: projectsRoot,
        folderName: "tour",
        title: "Tour",
        firstChapterId: "prologue",
        firstChapterTitle: "Prologue",
        withExample: true,
      },
    });
    assert.equal(created.statusCode, 200);
    const { project } = created.json();
    service.setProjectCodeTrust(project.id, false);

    const opened = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/open`,
    });
    assert.equal(opened.statusCode, 200);
    const bundle = opened.json().bundle;
    assert.equal(bundle.scenario.chapters.length, 2);
    assert.ok(bundle.chapters.prologue);
    assert.ok(bundle.chapters.two);
    assert.ok(bundle.items.items.keycard);
    assert.ok(bundle.meta.events.arrived);
    assert.ok(bundle.meta.flags.explored);
    assert.equal(bundle.scenario.defaultStats.resolve, 2);
  } finally {
    await app.close();
    await service.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("create route with withCode scaffolds starter code and trusts it", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-create-code-"));
  const projectsRoot = path.join(root, "data");
  await fs.mkdir(projectsRoot, { recursive: true });
  const service = new ProjectService({
    roots: [projectsRoot],
    dbPath: path.join(root, "editor.db"),
  });
  const app = Fastify();
  try {
    await service.start();
    await app.register(async (routes) => registerRoutes(routes, service), { prefix: "/api/v1" });

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/projects/create",
      payload: {
        parentPath: projectsRoot,
        folderName: "coded",
        title: "Coded",
        withCode: true,
      },
    });
    assert.equal(created.statusCode, 200);
    const { project } = created.json();

    // Starter src/ exists on disk...
    await fs.access(path.join(projectsRoot, "coded", "src", "game.ts"));
    await fs.access(path.join(projectsRoot, "coded", "src", "App.tsx"));

    // ...and the project opens without a trust prompt (auto-trusted).
    const opened = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/open`,
    });
    assert.equal(opened.statusCode, 200);
    assert.equal(opened.json().project.codeTrusted, true);
    assert.equal(opened.json().project.hasCustomCode, true);
  } finally {
    await app.close();
    await service.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("bootstrap-code route adds starter files to an existing project", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-bootstrap-route-"));
  const projectsRoot = path.join(root, "data");
  await fs.mkdir(projectsRoot, { recursive: true });
  const service = new ProjectService({
    roots: [projectsRoot],
    dbPath: path.join(root, "editor.db"),
  });
  const app = Fastify();
  try {
    await service.start();
    await app.register(async (routes) => registerRoutes(routes, service), { prefix: "/api/v1" });

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/projects/create",
      payload: { parentPath: projectsRoot, folderName: "plain", title: "Plain" },
    });
    const { project } = created.json();

    const bootstrapped = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/bootstrap-code`,
    });
    assert.equal(bootstrapped.statusCode, 200);
    assert.ok(bootstrapped.json().created.includes("src/game.ts"));

    const opened = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/open`,
    });
    assert.equal(opened.json().project.codeTrusted, true);
    assert.equal(opened.json().project.hasCustomCode, true);
  } finally {
    await app.close();
    await service.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
