import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { PACKAGED, REPO_ROOT, toolBinPath } from "./config.js";
import { getCargoTargetDir } from "./cargo.js";
import { EDITOR_CONFIG_BASENAME, EDITOR_SIDECAR_DIR } from "../shared/blackboxPaths.js";

export { EDITOR_SIDECAR_DIR } from "../shared/blackboxPaths.js";
const EDITOR_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const EDITOR_ID_LENGTH = 11;

function generateEditorId() {
  const bytes = randomBytes(EDITOR_ID_LENGTH);
  let id = "";
  for (let i = 0; i < EDITOR_ID_LENGTH; i++) {
    id += EDITOR_ID_ALPHABET[bytes[i] % EDITOR_ID_ALPHABET.length];
  }
  return id;
}

function resolveEditorPath(value, vars) {
  if (typeof value !== "string") return value;
  return value.replace(/\$([a-zA-Z_]\w*)/g, (match, name) => {
    const key = `$${name}`;
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}

export function nullTools() {
  const linter = toolBinPath("blackbox-lint");
  const bundler = toolBinPath("blackbox-bundler");
  const simulator = toolBinPath("blackbox-simulator");
  return {
    linter,
    linterBuild: null,
    bundler,
    bundlerBuild: null,
    simulator,
    simulatorBuild: null,
  };
}

function resolveToolBin(entry, pathVars) {
  let raw = null;
  if (typeof entry === "string") {
    raw = entry.trim() || null;
  } else if (entry && typeof entry === "object") {
    const platform = process.platform;
    const value = entry[platform] ?? entry["default"] ?? null;
    raw = typeof value === "string" ? value.trim() || null : null;
  }
  return raw ? resolveEditorPath(raw, pathVars) : null;
}

function resolveToolWithFallback(entry, pathVars, defaultName) {
  const configured = resolveToolBin(entry, pathVars);
  if (configured && existsSync(configured)) return configured;
  return toolBinPath(defaultName);
}

function resolveToolsFromDoc(doc, pathVars) {
  const fallback = nullTools();
  if (!doc.tools || typeof doc.tools !== "object") return fallback;

  return {
    linter: resolveToolWithFallback(doc.tools.linter, pathVars, "blackbox-lint"),
    linterBuild: PACKAGED ? null : resolveToolBuild(doc.tools.linter, pathVars),
    bundler: resolveToolWithFallback(doc.tools.bundler, pathVars, "blackbox-bundler"),
    bundlerBuild: PACKAGED ? null : resolveToolBuild(doc.tools.bundler, pathVars),
    simulator: resolveToolWithFallback(doc.tools.simulator, pathVars, "blackbox-simulator"),
    simulatorBuild: PACKAGED ? null : resolveToolBuild(doc.tools.simulator, pathVars),
  };
}

function resolveToolBuild(entry, pathVars) {
  if (!entry || typeof entry !== "object") return null;
  const build = entry.build;
  if (!build) return null;

  let raw = null;
  if (typeof build === "string") {
    raw = build.trim() || null;
  } else if (typeof build === "object") {
    const platform = process.platform;
    const value = build[platform] ?? build["default"] ?? null;
    raw = typeof value === "string" ? value.trim() || null : null;
  }
  return raw ? resolveEditorPath(raw, pathVars) : null;
}

function defaultDataRootCandidates() {
  const candidates = [];
  if (process.env.BLACKBOX_DATA_ROOT) {
    candidates.push(path.resolve(process.env.BLACKBOX_DATA_ROOT));
  }
  if (!PACKAGED) candidates.push(path.join(REPO_ROOT, "data"));
  return [...new Set(candidates)];
}

export async function findDefaultDataRoot() {
  for (const candidate of defaultDataRootCandidates()) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return path.resolve(candidate);
    } catch {
      continue;
    }
  }
  return null;
}

function projectEditorConfigPath(projectDir) {
  return path.join(projectDir, EDITOR_SIDECAR_DIR, EDITOR_CONFIG_BASENAME);
}

async function readEditorConfigFile(configPath, projectDir = null) {
  try {
    const text = await fs.readFile(configPath, "utf8");
    const doc = JSON.parse(text);
    if (!projectDir && (typeof doc.path !== "string" || !doc.path.trim())) {
      return { ok: false, error: `invalid editor.json (missing path): ${configPath}` };
    }

    const projectPath = projectDir
      ? path.resolve(projectDir)
      : path.resolve(resolveEditorPath(doc.path.trim(), { $workspace: REPO_ROOT }));
    const pathVars = {
      $workspace: REPO_ROOT,
      $project: projectPath,
      $target: await getCargoTargetDir(),
    };

    const tools = resolveToolsFromDoc(doc, pathVars);

    const id = typeof doc.id === "string" && doc.id.trim() ? doc.id.trim() : null;
    return { ok: true, projectPath, tools, id, doc };
  } catch (error) {
    if (error?.code === "ENOENT") return { ok: false, missing: true };
    return { ok: false, error: `failed to read editor.json: ${configPath}` };
  }
}

async function writeEditorConfigFile(configPath, doc) {
  await fs.writeFile(configPath, `${JSON.stringify(doc, null, 2)}\n`);
}

export async function ensureProjectEditorConfig(projectDir) {
  const resolvedProjectDir = path.resolve(projectDir);
  const configPath = projectEditorConfigPath(resolvedProjectDir);
  const existing = await readEditorConfigFile(configPath, resolvedProjectDir);

  if (existing.ok) {
    if (!existing.id) {
      const doc = { ...existing.doc, id: generateEditorId() };
      await writeEditorConfigFile(configPath, doc);
      return { ...existing, id: doc.id, doc };
    }
    return existing;
  }

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const doc = { id: generateEditorId(), path: resolvedProjectDir };
  await writeEditorConfigFile(configPath, doc);
  return { ok: true, projectPath: resolvedProjectDir, tools: nullTools(), id: doc.id, doc };
}

export async function regenerateProjectEditorId(projectDir) {
  const configPath = projectEditorConfigPath(path.resolve(projectDir));
  const text = await fs.readFile(configPath, "utf8");
  const doc = { ...JSON.parse(text), id: generateEditorId() };
  await writeEditorConfigFile(configPath, doc);
  return doc.id;
}

export async function readToolsConfigForScenario(scenarioName) {
  if (!scenarioName) return nullTools();
  const dataRoot = await findDefaultDataRoot();
  if (!dataRoot) return nullTools();
  const project = await findScenarioProject(dataRoot, scenarioName);
  if (!project.ok) return nullTools();
  const config = await readEditorConfigFile(projectEditorConfigPath(project.projectDir));
  return config.ok ? (config.tools ?? nullTools()) : nullTools();
}

async function findScenarioProject(dataRoot, scenarioName) {
  const candidates = [
    path.join(dataRoot, scenarioName),
    path.join(dataRoot, "scenarios", scenarioName),
  ];

  for (const projectDir of candidates) {
    const scenarioPath = path.join(projectDir, "scenario.json");
    try {
      const stat = await fs.stat(scenarioPath);
      if (stat.isFile()) return { ok: true, projectDir: path.resolve(projectDir), scenarioPath };
    } catch {
      continue;
    }
  }

  return { ok: false, error: `scenario not found: ${scenarioName} (data root: ${dataRoot})` };
}

export async function resolveScenarioFromName(scenarioNameInput) {
  const scenarioName = typeof scenarioNameInput === "string" ? scenarioNameInput.trim() : "";

  if (!scenarioName) return { ok: false, error: "scenarioName is required" };

  const dataRoot = await findDefaultDataRoot();
  if (!dataRoot) return { ok: false, error: "no data root found; set BLACKBOX_DATA_ROOT" };

  const project = await findScenarioProject(dataRoot, scenarioName);
  if (!project.ok) return project;

  const config = await ensureProjectEditorConfig(project.projectDir);
  if (!config.ok) return config;

  const scenarioPath = path.join(config.projectPath, "scenario.json");
  try {
    await fs.access(scenarioPath);
  } catch {
    return { ok: false, error: `scenario.json not found for project path: ${config.projectPath}` };
  }

  return {
    ok: true,
    dataRoot,
    projectPath: config.projectPath,
    projectId: config.id ?? null,
    scenarioName,
    scenarioPath,
    tools: config.tools ?? nullTools(),
  };
}

export function scenarioNameFromBody(body) {
  if (!body || typeof body !== "object") return "";
  if (typeof body.scenarioName === "string") return body.scenarioName.trim();
  return "";
}
