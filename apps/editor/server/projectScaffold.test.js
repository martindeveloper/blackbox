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
  ensureProjectSidecars,
  writeNewProject,
} from "./projectScaffold.js";

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
