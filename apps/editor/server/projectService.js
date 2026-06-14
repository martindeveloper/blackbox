import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import chokidar from "chokidar";
import { projectHasLocalUi } from "../../../scripts/lib/gamePaths.mjs";
import {
  PACKAGED,
  REPO_ROOT,
  USER_DATA_ROOT,
} from "./config.js";
import { ensureProjectEditorConfig, regenerateProjectEditorId } from "./editorConfig.js";
import { ensureProjectSidecars } from "./projectScaffold.js";
import {
  EDITOR_DB_BASENAME,
  EDITOR_SIDECAR_DIR,
  HEATMAP_PATH,
  LAYOUT_PATH,
  TOOL_RUNS_DIR,
  TRASH_DIR,
  TRASH_MANIFEST,
} from "../shared/blackboxPaths.js";

const MEDIA_ROOTS = new Set(["textures", "music", "sfx"]);
const HEATMAP_SCHEMA_VERSION = 2;

export class ProjectError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function projectRoots() {
  const configured = [
    process.env.BLACKBOX_DATA_ROOT,
    ...(process.env.BLACKBOX_DATA_ROOTS?.split(path.delimiter) ?? []),
  ];
  if (!PACKAGED) configured.push(path.join(REPO_ROOT, "data"));
  if (PACKAGED) configured.push(os.homedir());
  return [...new Set(configured.filter(Boolean).map((root) => path.resolve(root)))];
}

function isInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function mimeFromName(name) {
  const ext = path.extname(name).toLowerCase();
  return (
    {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
      ".m4a": "audio/mp4",
    }[ext] ?? "application/octet-stream"
  );
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (fallback !== undefined && error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(root, relative = "") {
  const directory = path.join(root, relative);
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await walkFiles(root, child)));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

function projectRelativePath(projectPath, filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(projectPath, filePath);
  return path.relative(projectPath, absolute).split(path.sep).join("/");
}

function isToolRunSidecar(relativePath) {
  return relativePath === TOOL_RUNS_DIR || relativePath.startsWith(`${TOOL_RUNS_DIR}/`);
}

function isAnalyticsRow(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    Number.isFinite(value.count) &&
    Number.isFinite(value.total) &&
    Number.isFinite(value.pct)
  );
}

function isTrafficRow(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    Number.isFinite(value.visits) &&
    Number.isFinite(value.reach) &&
    Number.isFinite(value.reachPct) &&
    Number.isFinite(value.outDegree)
  );
}

function isPerEnding(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.ending === "string" &&
    Number.isFinite(value.pathCount) &&
    Array.isArray(value.nodes) &&
    value.nodes.every(
      (node) =>
        node &&
        typeof node === "object" &&
        typeof node.id === "string" &&
        Number.isFinite(node.reach) &&
        Number.isFinite(node.reachPct),
    )
  );
}

function normalizeAnalytics(value) {
  if (!value || typeof value !== "object") return null;
  const nodeTraffic = Array.isArray(value.nodeTraffic)
    ? value.nodeTraffic
    : Array.isArray(value.hotNodes)
      ? value.hotNodes
      : null;
  if (
    !Array.isArray(value.mandatoryNodes) ||
    !value.mandatoryNodes.every((node) => typeof node === "string") ||
    !Number.isFinite(value.totalEndings) ||
    !Array.isArray(value.nodeImportance ?? value.importance) ||
    !(value.nodeImportance ?? value.importance).every(isAnalyticsRow) ||
    !Array.isArray(value.importance) ||
    !value.importance.every(isAnalyticsRow) ||
    !Number.isFinite(value.totalPaths) ||
    !Array.isArray(value.accessibility) ||
    !value.accessibility.every(isAnalyticsRow) ||
    !nodeTraffic ||
    !nodeTraffic.every(isTrafficRow) ||
    !Array.isArray(value.hotNodes) ||
    !value.hotNodes.every(isTrafficRow) ||
    !Array.isArray(value.splitCandidates) ||
    !value.splitCandidates.every(isTrafficRow) ||
    !Array.isArray(value.perEnding) ||
    !value.perEnding.every(isPerEnding)
  ) {
    return null;
  }
  return {
    ...value,
    nodeImportance: value.nodeImportance ?? value.importance,
    nodeTraffic,
  };
}

function normalizeHeatmapRecord(value) {
  if (!value || typeof value !== "object") return null;
  const analytics = normalizeAnalytics(value.analytics);
  if (!analytics || !Number.isFinite(value.capturedAt)) return null;
  return {
    version: value.version === HEATMAP_SCHEMA_VERSION ? HEATMAP_SCHEMA_VERSION : 1,
    analytics,
    meta: value.meta && typeof value.meta === "object" ? value.meta : null,
    capturedAt: value.capturedAt,
    contentFingerprint:
      typeof value.contentFingerprint === "string" ? value.contentFingerprint : null,
    sourceRevision: Number.isFinite(value.sourceRevision) ? value.sourceRevision : null,
    scenarioRevision: typeof value.scenarioRevision === "string" ? value.scenarioRevision : null,
    runId: typeof value.runId === "string" ? value.runId : null,
  };
}

function trashName(originalPath, id) {
  const ext = path.extname(originalPath);
  const base = path.basename(originalPath, ext);
  return `${base}_${id}${ext}`;
}

export class ProjectService {
  constructor(options = {}) {
    this.roots = options.roots ?? projectRoots();
    this.dbPath =
      options.dbPath ?? path.join(USER_DATA_ROOT, EDITOR_SIDECAR_DIR, EDITOR_DB_BASENAME);
    this.projects = new Map();
    this.queues = new Map();
    this.watchers = new Map();
    this.listeners = new Map();
    this.suppressed = new Map();
    this.db = null;
  }

  async start() {
    this.roots = (
      await Promise.all(
        this.roots.map(async (root) => {
          try {
            return await fs.realpath(root);
          } catch {
            return null;
          }
        }),
      )
    ).filter(Boolean);
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        title TEXT,
        revision INTEGER NOT NULL DEFAULT 1,
        last_opened TEXT
      );
      CREATE TABLE IF NOT EXISTS files (
        project_id TEXT NOT NULL,
        path TEXT NOT NULL,
        size INTEGER NOT NULL,
        modified_ms INTEGER NOT NULL,
        PRIMARY KEY (project_id, path)
      );
    `);
    await this.loadPersistedProjects();
    if (!PACKAGED) await this.discover();
  }

  async loadPersistedProjects() {
    const rows = this.db.prepare("SELECT path FROM projects ORDER BY last_opened DESC").all();
    for (const row of rows) {
      try {
        await this.registerProject(row.path);
      } catch (error) {
        if (error?.code === "ENOENT") {
          this.db.prepare("DELETE FROM projects WHERE path = ?").run(row.path);
        }
        console.warn(`Skipping persisted project at ${row.path}: ${error?.message ?? error}`);
      }
    }
  }

  async close() {
    await Promise.all([...this.watchers.values()].map((watcher) => watcher.close()));
    this.watchers.clear();
    this.db?.close();
  }

  async discover() {
    const candidates = [];
    for (const root of this.roots) {
      let entries = [];
      try {
        entries = await fs.readdir(root, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        candidates.push(path.join(root, entry.name));
        if (entry.name === "scenarios") {
          const nested = await fs.readdir(path.join(root, entry.name), { withFileTypes: true });
          candidates.push(
            ...nested
              .filter((item) => item.isDirectory())
              .map((item) => path.join(root, entry.name, item.name)),
          );
        }
      }
    }

    for (const candidate of candidates) {
      if (!(await exists(path.join(candidate, "scenario.json")))) continue;
      await this.registerProject(candidate);
    }
    return this.listProjects();
  }

  addRoot(root) {
    const resolved = path.resolve(root);
    if (!this.roots.includes(resolved)) this.roots.push(resolved);
  }

  removeProjectRow(id) {
    this.projects.delete(id);
    const watcher = this.watchers.get(id);
    if (watcher) {
      void watcher.close();
      this.watchers.delete(id);
    }
    this.db.prepare("DELETE FROM files WHERE project_id = ?").run(id);
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  }

  reconcileStaleProjectRows(id, projectPath) {
    const staleByPath = this.db
      .prepare("SELECT id FROM projects WHERE path = ? AND id != ?")
      .all(projectPath, id);
    for (const row of staleByPath) this.removeProjectRow(row.id);
  }

  async deleteProject(id, confirmName) {
    const project = this.requireProject(id);
    const expected = project.name.trim();
    const provided = typeof confirmName === "string" ? confirmName.trim() : "";
    if (!expected || provided !== expected) {
      throw new ProjectError(
        "invalid_request",
        "Confirmation name does not match the project folder name",
      );
    }
    for (const root of this.roots) {
      if (project.path === path.resolve(root)) {
        throw new ProjectError("invalid_request", "Cannot delete a project root directory");
      }
    }

    this.removeProjectRow(id);
    try {
      await fs.rm(project.path, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  async registerProject(projectPath) {
    const canonical = await fs.realpath(projectPath);
    if (!this.roots.some((root) => isInside(canonical, root))) {
      if (PACKAGED) this.addRoot(canonical);
      else throw new ProjectError("invalid_project", "Project is outside configured roots");
    }

    let config = await ensureProjectEditorConfig(canonical);
    if (!config.ok || !config.id) {
      throw new ProjectError("invalid_project", config.error ?? "Project configuration is invalid");
    }
    const registered = this.projects.get(config.id);
    const persisted = this.db.prepare("SELECT path FROM projects WHERE id = ?").get(config.id);
    const idBelongsElsewhere =
      (registered && registered.path !== canonical) ||
      (persisted?.path !== canonical && (await exists(persisted?.path ?? "")));
    if (idBelongsElsewhere) {
      const id = await regenerateProjectEditorId(canonical);
      config = { ...config, id, doc: { ...config.doc, id } };
    }
    const scenario = await readJson(path.join(canonical, "scenario.json"));
    const existing = this.db
      .prepare("SELECT revision, last_opened FROM projects WHERE id = ?")
      .get(config.id);
    const project = {
      id: config.id,
      path: canonical,
      name: path.basename(canonical),
      title: typeof scenario.title === "string" ? scenario.title : null,
      hasLocalUi: projectHasLocalUi(canonical),
      revision: Number(existing?.revision ?? 1),
      lastOpened: existing?.last_opened ?? null,
      tools: config.tools,
    };
    this.reconcileStaleProjectRows(project.id, project.path);
    this.projects.set(project.id, project);
    this.db
      .prepare(`
        INSERT INTO projects (id, path, name, title, revision, last_opened)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET path=excluded.path, name=excluded.name, title=excluded.title
      `)
      .run(
        project.id,
        project.path,
        project.name,
        project.title,
        project.revision,
        project.lastOpened,
      );
    await this.indexProject(project);
    await this.watchProject(project);
    return project;
  }

  listProjects() {
    return [...this.projects.values()]
      .map((project) => ({
        id: project.id,
        path: project.path,
        name: project.name,
        title: project.title,
        revision: project.revision,
        lastOpened: project.lastOpened,
      }))
      .sort((a, b) => {
        if (a.lastOpened && b.lastOpened) return b.lastOpened.localeCompare(a.lastOpened);
        if (a.lastOpened) return -1;
        if (b.lastOpened) return 1;
        return (a.title ?? a.name).localeCompare(b.title ?? b.name);
      });
  }

  requireProject(id) {
    const project = this.projects.get(id);
    if (!project) throw new ProjectError("invalid_project", `Unknown project: ${id}`);
    return project;
  }

  resolvePath(project, relativePath) {
    if (typeof relativePath !== "string" || !relativePath || relativePath.includes("\0")) {
      throw new ProjectError("invalid_path", "A relative project path is required");
    }
    const normalized = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
    const resolved = path.resolve(project.path, normalized);
    if (!isInside(resolved, project.path)) {
      throw new ProjectError("invalid_path", `Path escapes project: ${relativePath}`);
    }
    let existing = existsSync(resolved) ? resolved : path.dirname(resolved);
    while (!existsSync(existing) && existing !== project.path) existing = path.dirname(existing);
    const realExisting = realpathSync(existing);
    if (!isInside(realExisting, project.path)) {
      throw new ProjectError(
        "invalid_path",
        `Path crosses a symlink outside the project: ${relativePath}`,
      );
    }
    if (existsSync(resolved) && !isInside(realpathSync(resolved), project.path)) {
      throw new ProjectError("invalid_path", `Path resolves outside the project: ${relativePath}`);
    }
    return { relative: normalized, absolute: resolved };
  }

  async openProject(id) {
    const project = this.requireProject(id);
    const now = new Date().toISOString();
    project.lastOpened = now;
    this.db.prepare("UPDATE projects SET last_opened = ? WHERE id = ?").run(now, id);
    return this.snapshot(project);
  }

  async snapshot(project) {
    const scenarioPath = "scenario.json";
    const scenario = await readJson(path.join(project.path, scenarioPath));
    await ensureProjectSidecars(project.path, scenario);
    const itemsPath = scenario.itemsRef ?? "items.json";
    const charactersPath = scenario.charactersRef ?? "characters.json";
    const assetsPath = scenario.assetsRef ?? "assets.json";
    const metaPath = scenario.catalogRef ?? null;
    const libraryPath = scenario.libraryRef ?? null;
    const [items, characters, assets, meta, library] = await Promise.all([
      readJson(this.resolvePath(project, itemsPath).absolute),
      readJson(this.resolvePath(project, charactersPath).absolute),
      readJson(this.resolvePath(project, assetsPath).absolute),
      metaPath ? readJson(this.resolvePath(project, metaPath).absolute) : Promise.resolve(null),
      libraryPath
        ? readJson(this.resolvePath(project, libraryPath).absolute)
        : Promise.resolve(null),
    ]);

    const chapters = {};
    const chapterFiles = {};
    for (const chapterRef of scenario.chapters ?? []) {
      const chapter = await readJson(this.resolvePath(project, chapterRef.ref).absolute);
      chapters[chapter.id] = chapter;
      chapterFiles[chapter.id] = chapterRef.ref;
    }

    const layoutPath = LAYOUT_PATH;
    const layout = await readJson(path.join(project.path, layoutPath), { chapters: {} });
    const mediaFiles = await this.scanMedia(project);
    const trashItems = await readJson(path.join(project.path, TRASH_MANIFEST), []);
    const rootFiles = await this.scanRootJson(project);

    return {
      project: {
        id: project.id,
        name: project.name,
        title: project.title,
        path: project.path,
        revision: project.revision,
      },
      bundle: {
        scenarioName: project.name,
        scenarioDir: project.path,
        folderName: project.name,
        scenario,
        chapters,
        chapterFiles,
        items,
        characters,
        assets,
        meta,
        library,
        layout: layout.chapters ? layout : { chapters: {} },
        filePaths: {
          scenario: scenarioPath,
          items: itemsPath,
          characters: charactersPath,
          assets: assetsPath,
          meta: metaPath,
          library: libraryPath,
          chapters: chapterFiles,
          layout: layoutPath,
        },
      },
      mediaFiles,
      trashItems,
      rootFiles,
    };
  }

  heatmapPath(project) {
    return path.join(project.path, HEATMAP_PATH);
  }

  async contentFingerprint(project) {
    const files = (await walkFiles(project.path))
      .filter(
        (relative) =>
          relative.toLowerCase().endsWith(".json") &&
          !relative.startsWith(`${EDITOR_SIDECAR_DIR}/`),
      )
      .sort();
    const hash = createHash("sha256");
    for (const relative of files) {
      hash.update(relative);
      hash.update("\0");
      hash.update(await fs.readFile(path.join(project.path, relative)));
      hash.update("\0");
    }
    return hash.digest("hex");
  }

  async readHeatmap(id) {
    const project = this.requireProject(id);
    const file = this.heatmapPath(project);
    const stored = normalizeHeatmapRecord(await readJson(file, null));
    const currentFingerprint = stored ? await this.contentFingerprint(project) : null;
    return {
      stored,
      path: file,
      stale:
        stored !== null &&
        (stored.contentFingerprint === null || stored.contentFingerprint !== currentFingerprint),
    };
  }

  async writeHeatmap(id, payload) {
    const project = this.requireProject(id);
    const analytics = normalizeAnalytics(payload?.analytics);
    if (!analytics)
      throw new ProjectError("invalid_request", "valid analytics payload is required");
    const file = this.heatmapPath(project);
    const record = {
      version: HEATMAP_SCHEMA_VERSION,
      analytics,
      meta: payload.meta ?? null,
      capturedAt: Number.isFinite(payload.capturedAt) ? payload.capturedAt : Date.now(),
      contentFingerprint: await this.contentFingerprint(project),
      sourceRevision: Number.isFinite(payload.sourceRevision) ? payload.sourceRevision : null,
      scenarioRevision:
        typeof payload.scenarioRevision === "string" ? payload.scenarioRevision : null,
      runId: typeof payload.runId === "string" ? payload.runId : null,
    };
    this.suppress(file);
    await writeJson(file, record);
    return { stored: record, path: file, stale: false };
  }

  async deleteHeatmap(id) {
    const project = this.requireProject(id);
    const file = this.heatmapPath(project);
    this.suppress(file);
    await fs.rm(file, { force: true });
    return { ok: true };
  }

  async scanRootJson(project) {
    const entries = await fs.readdir(project.path, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
      let spec = null;
      try {
        const value = await readJson(path.join(project.path, entry.name));
        spec = typeof value.spec === "string" ? value.spec : null;
      } catch {}
      files.push({ name: entry.name, path: entry.name, spec });
    }
    return files.sort((a, b) => a.name.localeCompare(b.name));
  }

  async scanMedia(project) {
    const output = [];
    for (const category of MEDIA_ROOTS) {
      for (const relative of await walkFiles(project.path, category)) {
        const stat = await fs.stat(path.join(project.path, relative));
        output.push({
          path: relative,
          category,
          name: path.basename(relative),
          size: stat.size,
          mimeType: mimeFromName(relative),
        });
      }
    }
    return output.sort((a, b) => a.path.localeCompare(b.path));
  }

  async saveDocuments(id, { baseRevision, documents, force = false, clientId = null }) {
    const project = this.requireProject(id);
    return this.exclusive(id, async () => {
      this.assertRevision(project, baseRevision, force);
      if (!documents || typeof documents !== "object" || Array.isArray(documents)) {
        throw new ProjectError("invalid_request", "documents must be an object");
      }

      const writes = Object.entries(documents).map(([relativePath, value]) => {
        if (!relativePath.endsWith(".json")) {
          throw new ProjectError(
            "invalid_path",
            `Only JSON documents may be saved: ${relativePath}`,
          );
        }
        const target = this.resolvePath(project, relativePath);
        return { ...target, content: `${JSON.stringify(value, null, 2)}\n` };
      });
      await this.atomicWrite(project, writes);
      const revision = await this.commitMutation(
        project,
        writes.map((write) => write.relative),
        clientId,
      );
      return { revision };
    });
  }

  async uploadMedia(id, { baseRevision, targetDir, filename, data, clientId = null }) {
    const project = this.requireProject(id);
    return this.exclusive(id, async () => {
      this.assertRevision(project, baseRevision, false);
      const root = String(targetDir ?? "")
        .replaceAll("\\", "/")
        .replace(/^\/+|\/+$/g, "");
      if (!MEDIA_ROOTS.has(root.split("/")[0])) {
        throw new ProjectError(
          "invalid_path",
          "Media must be uploaded under textures, music, or sfx",
        );
      }
      const safeName = path.basename(filename);
      const target = this.resolvePath(project, `${root}/${safeName}`);
      await fs.mkdir(path.dirname(target.absolute), { recursive: true });
      this.suppress(target.absolute);
      await fs.writeFile(target.absolute, data);
      const revision = await this.commitMutation(project, [target.relative], clientId);
      return { path: target.relative, revision, mediaFiles: await this.scanMedia(project) };
    });
  }

  async readMedia(id, relativePath) {
    const project = this.requireProject(id);
    const target = this.resolvePath(project, relativePath);
    if (!MEDIA_ROOTS.has(target.relative.split("/")[0])) {
      throw new ProjectError("invalid_path", "Not a media path");
    }
    return { data: await fs.readFile(target.absolute), mimeType: mimeFromName(target.relative) };
  }

  /**
   * Raw authored JSON documents for the in-editor preview. Returns the on-disk
   * text verbatim (envelopes intact) so the engine can decode it directly with
   * no bundler. Media is fetched separately from `readMedia`.
   */
  async readPreviewDocs(id) {
    const project = this.requireProject(id);
    const readText = (relativePath) =>
      fs.readFile(this.resolvePath(project, relativePath).absolute, "utf8");

    const scenario = await readText("scenario.json");
    const parsed = JSON.parse(scenario);
    const chapterRefs = parsed.chapters ?? [];
    const [items, characters, assets, catalog, library, ...chapterTexts] = await Promise.all([
      readText(parsed.itemsRef ?? "items.json"),
      readText(parsed.charactersRef ?? "characters.json"),
      readText(parsed.assetsRef ?? "assets.json"),
      parsed.catalogRef ? readText(parsed.catalogRef) : undefined,
      parsed.libraryRef ? readText(parsed.libraryRef) : undefined,
      ...chapterRefs.map((chapterRef) => readText(chapterRef.ref)),
    ]);
    const chapters = chapterRefs.map((chapterRef, index) => ({
      id: chapterRef.id,
      title: chapterRef.title ?? chapterRef.id,
      json: chapterTexts[index],
    }));

    return {
      projectId: project.id,
      revision: project.revision,
      docs: { scenario, items, characters, assets, catalog, library, chapters },
    };
  }

  async moveMediaToTrash(id, { baseRevision, relativePath, clientId = null }) {
    const project = this.requireProject(id);
    return this.exclusive(id, async () => {
      this.assertRevision(project, baseRevision, false);
      const source = this.resolvePath(project, relativePath);
      if (!MEDIA_ROOTS.has(source.relative.split("/")[0])) {
        throw new ProjectError("invalid_path", "Not a media path");
      }
      const stat = await fs.stat(source.absolute);
      const idPart = `${Date.now()}_${randomBytes(3).toString("hex")}`;
      const storedName = trashName(source.relative, idPart);
      const destination = this.resolvePath(project, `${TRASH_DIR}/${storedName}`);
      await fs.mkdir(path.dirname(destination.absolute), { recursive: true });
      this.suppress(source.absolute);
      this.suppress(destination.absolute);
      await fs.rename(source.absolute, destination.absolute);
      const entries = await readJson(path.join(project.path, TRASH_MANIFEST), []);
      entries.push({
        id: idPart,
        originalPath: source.relative,
        trashedAt: new Date().toISOString(),
        trashName: storedName,
        size: stat.size,
        mimeType: mimeFromName(source.relative),
      });
      await this.writeTrashManifest(project, entries);
      const revision = await this.commitMutation(
        project,
        [source.relative, destination.relative, TRASH_MANIFEST],
        clientId,
      );
      return { revision, mediaFiles: await this.scanMedia(project), trashItems: entries };
    });
  }

  async restoreTrash(id, { baseRevision, entryId, overwrite = false, clientId = null }) {
    const project = this.requireProject(id);
    return this.exclusive(id, async () => {
      this.assertRevision(project, baseRevision, false);
      const entries = await readJson(path.join(project.path, TRASH_MANIFEST), []);
      const entry = entries.find((item) => item.id === entryId);
      if (!entry) throw new ProjectError("not_found", "Trash entry not found");
      const source = this.resolvePath(project, `${TRASH_DIR}/${entry.trashName}`);
      const destination = this.resolvePath(project, entry.originalPath);
      if (!overwrite && (await exists(destination.absolute))) {
        throw new ProjectError("file_exists", `File already exists: ${entry.originalPath}`);
      }
      await fs.mkdir(path.dirname(destination.absolute), { recursive: true });
      if (overwrite) await fs.rm(destination.absolute, { force: true });
      this.suppress(source.absolute);
      this.suppress(destination.absolute);
      await fs.rename(source.absolute, destination.absolute);
      const remaining = entries.filter((item) => item.id !== entryId);
      await this.writeTrashManifest(project, remaining);
      const revision = await this.commitMutation(
        project,
        [source.relative, destination.relative, TRASH_MANIFEST],
        clientId,
      );
      return { revision, mediaFiles: await this.scanMedia(project), trashItems: remaining };
    });
  }

  async deleteTrash(id, { baseRevision, entryId, clientId = null }) {
    return this.mutateTrash(
      id,
      baseRevision,
      (entries) => entries.filter((entry) => entry.id !== entryId),
      clientId,
    );
  }

  async emptyTrash(id, { baseRevision, clientId = null }) {
    return this.mutateTrash(id, baseRevision, () => [], clientId);
  }

  async mutateTrash(id, baseRevision, selectRemaining, clientId) {
    const project = this.requireProject(id);
    return this.exclusive(id, async () => {
      this.assertRevision(project, baseRevision, false);
      const entries = await readJson(path.join(project.path, TRASH_MANIFEST), []);
      const remaining = selectRemaining(entries);
      const remainingIds = new Set(remaining.map((entry) => entry.id));
      const removed = entries.filter((entry) => !remainingIds.has(entry.id));
      for (const entry of removed) {
        const target = this.resolvePath(project, `${TRASH_DIR}/${entry.trashName}`);
        this.suppress(target.absolute);
        await fs.rm(target.absolute, { force: true });
      }
      await this.writeTrashManifest(project, remaining);
      const revision = await this.commitMutation(
        project,
        [...removed.map((entry) => `${TRASH_DIR}/${entry.trashName}`), TRASH_MANIFEST],
        clientId,
      );
      return { revision, trashItems: remaining };
    });
  }

  async writeTrashManifest(project, entries) {
    const target = path.join(project.path, TRASH_MANIFEST);
    this.suppress(target);
    await writeJson(target, entries);
  }

  assertRevision(project, baseRevision, force) {
    if (!force && Number(baseRevision) !== project.revision) {
      throw new ProjectError("revision_conflict", "Project changed since it was loaded", {
        currentRevision: project.revision,
      });
    }
  }

  async atomicWrite(project, writes) {
    const transactionId = randomBytes(6).toString("hex");
    const prepared = [];
    try {
      for (const write of writes) {
        await fs.mkdir(path.dirname(write.absolute), { recursive: true });
        const temporary = `${write.absolute}.blackbox-${transactionId}.tmp`;
        const backup = `${write.absolute}.blackbox-${transactionId}.bak`;
        await fs.writeFile(temporary, write.content);
        prepared.push({ ...write, temporary, backup, existed: await exists(write.absolute) });
      }
      for (const write of prepared) {
        this.suppress(write.absolute);
        if (write.existed) await fs.rename(write.absolute, write.backup);
        await fs.rename(write.temporary, write.absolute);
        write.replaced = true;
      }
      await Promise.all(prepared.map((write) => fs.rm(write.backup, { force: true })));
    } catch (error) {
      for (const write of prepared.reverse()) {
        await fs.rm(write.temporary, { force: true });
        if (await exists(write.backup)) {
          await fs.rm(write.absolute, { force: true });
          await fs.rename(write.backup, write.absolute);
        } else if (write.replaced && !write.existed) {
          await fs.rm(write.absolute, { force: true });
        }
      }
      throw error;
    }
  }

  async exclusive(id, operation) {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    this.queues.set(id, current);
    try {
      return await current;
    } finally {
      if (this.queues.get(id) === current) this.queues.delete(id);
    }
  }

  async commitMutation(project, changedPaths, clientId = null) {
    project.revision += 1;
    this.db
      .prepare("UPDATE projects SET revision = ? WHERE id = ?")
      .run(project.revision, project.id);
    await this.indexProject(project);
    this.emit(project.id, { revision: project.revision, changedPaths, source: "api", clientId });
    return project.revision;
  }

  withRevision(id, expectedRevision, operation) {
    const project = this.requireProject(id);
    return this.exclusive(id, async () => {
      this.assertRevision(project, expectedRevision, false);
      return operation(project);
    });
  }

  async indexProject(project) {
    if (!this.db) return;
    const files = (await walkFiles(project.path)).filter((relative) => !isToolRunSidecar(relative));
    const replace = this.db.prepare(`
      INSERT INTO files (project_id, path, size, modified_ms)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id, path) DO UPDATE SET size=excluded.size, modified_ms=excluded.modified_ms
    `);
    this.db.prepare("DELETE FROM files WHERE project_id = ?").run(project.id);
    for (const relative of files) {
      let stat;
      try {
        stat = await fs.stat(path.join(project.path, relative));
      } catch (error) {
        if (error?.code === "ENOENT") continue;
        throw error;
      }
      replace.run(project.id, relative, stat.size, Math.trunc(stat.mtimeMs));
    }
  }

  suppress(filePath) {
    this.suppressed.set(path.resolve(filePath), Date.now() + 1500);
  }

  async watchProject(project) {
    if (this.watchers.has(project.id)) return;
    const watcher = chokidar.watch(project.path, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 25 },
      ignored: (filePath) =>
        isToolRunSidecar(projectRelativePath(project.path, filePath)) ||
        /\.blackbox-[a-f0-9]+\.(tmp|bak)$/.test(filePath),
    });
    const onChange = (filePath) => {
      void this.onExternalChange(project, filePath).catch((error) => {
        console.error(`Failed to process external project change at ${filePath}:`, error);
      });
    };
    watcher.on("add", onChange).on("change", onChange).on("unlink", onChange);
    this.watchers.set(project.id, watcher);
  }

  async onExternalChange(project, filePath) {
    const absolute = path.isAbsolute(filePath)
      ? path.resolve(filePath)
      : path.resolve(project.path, filePath);
    const relative = projectRelativePath(project.path, absolute);
    if (isToolRunSidecar(relative)) return;

    const suppressedUntil = this.suppressed.get(absolute) ?? 0;
    if (suppressedUntil >= Date.now()) {
      this.suppressed.delete(absolute);
      return;
    }
    await this.exclusive(project.id, async () => {
      project.revision += 1;
      this.db
        .prepare("UPDATE projects SET revision = ? WHERE id = ?")
        .run(project.revision, project.id);
      await this.indexProject(project);
      this.emit(project.id, {
        revision: project.revision,
        changedPaths: [relative],
        source: "external",
      });
    });
  }

  subscribe(id, listener) {
    this.requireProject(id);
    const listeners = this.listeners.get(id) ?? new Set();
    listeners.add(listener);
    this.listeners.set(id, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(id);
    };
  }

  emit(id, event) {
    for (const listener of this.listeners.get(id) ?? []) listener(event);
  }
}
