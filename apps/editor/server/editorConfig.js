import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { PACKAGED, REPO_ROOT, toolBinPath } from "./config.js";
import { getCargoTargetDir } from "./cargo.js";
import {
  EDITOR_SIDECAR_DIR,
  PROJECT_CONFIG_BASENAME,
  USER_TOOLS_PATH,
} from "../shared/blackboxPaths.js";
import { EDITOR_VERSION } from "../shared/editorVersion.js";

export { EDITOR_SIDECAR_DIR } from "../shared/blackboxPaths.js";
const EDITOR_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const EDITOR_ID_LENGTH = 11;
const EDITOR_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

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

function projectConfigPath(projectDir) {
  return path.join(projectDir, EDITOR_SIDECAR_DIR, PROJECT_CONFIG_BASENAME);
}

async function readJsonFile(filePath) {
  try {
    return { ok: true, doc: JSON.parse(await fs.readFile(filePath, "utf8")) };
  } catch (error) {
    if (error?.code === "ENOENT") return { ok: false, missing: true };
    return { ok: false, error: `failed to read JSON: ${filePath}` };
  }
}

async function writeJsonFile(filePath, doc) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(doc, null, 2)}\n`);
}

function normalizeProjectConfigFields(doc) {
  const id =
    typeof doc.id === "string" && EDITOR_ID_PATTERN.test(doc.id.trim())
      ? doc.id.trim()
      : generateEditorId();
  const editorVersion =
    typeof doc.editorVersion === "string" && doc.editorVersion.trim()
      ? doc.editorVersion.trim()
      : EDITOR_VERSION;
  return { id, editorVersion };
}

function projectConfigOnDisk(doc) {
  return (
    typeof doc.id === "string" &&
    typeof doc.editorVersion === "string" &&
    Object.keys(doc).length === 2
  );
}

async function writeProjectConfig(projectDir, fields) {
  const normalized = normalizeProjectConfigFields(fields);
  const configPath = projectConfigPath(projectDir);
  const existing = await readJsonFile(configPath);
  if (
    existing.ok &&
    existing.doc.id === normalized.id &&
    existing.doc.editorVersion === normalized.editorVersion &&
    projectConfigOnDisk(existing.doc)
  ) {
    return normalized;
  }
  await writeJsonFile(configPath, normalized);
  return normalized;
}

async function readProjectTools(projectDir) {
  const toolsFile = await readJsonFile(path.join(projectDir, USER_TOOLS_PATH));
  if (!toolsFile.ok) return nullTools();
  const pathVars = {
    $workspace: REPO_ROOT,
    $project: projectDir,
    $target: await getCargoTargetDir(),
  };
  return resolveToolsFromDoc(toolsFile.doc, pathVars);
}

export async function ensureProjectEditorConfig(projectDir) {
  const resolvedProjectDir = path.resolve(projectDir);
  const configPath = projectConfigPath(resolvedProjectDir);
  const existing = await readJsonFile(configPath);
  if (!existing.ok && !existing.missing) return existing;

  const normalized = await writeProjectConfig(resolvedProjectDir, existing.ok ? existing.doc : {});
  return {
    ok: true,
    projectPath: resolvedProjectDir,
    tools: await readProjectTools(resolvedProjectDir),
    id: normalized.id,
    editorVersion: normalized.editorVersion,
    doc: normalized,
  };
}

export async function regenerateProjectEditorId(projectDir) {
  const resolvedProjectDir = path.resolve(projectDir);
  const existing = await readJsonFile(projectConfigPath(resolvedProjectDir));
  if (!existing.ok) {
    throw new Error(existing.error ?? `Missing project config for ${resolvedProjectDir}`);
  }
  const normalized = await writeProjectConfig(resolvedProjectDir, {
    ...existing.doc,
    id: generateEditorId(),
  });
  return normalized.id;
}

export async function writeProjectEditorVersion(projectDir, editorVersion) {
  const resolvedProjectDir = path.resolve(projectDir);
  const existing = await readJsonFile(projectConfigPath(resolvedProjectDir));
  if (!existing.ok) {
    throw new Error(existing.error ?? `Missing project config for ${resolvedProjectDir}`);
  }
  await writeProjectConfig(resolvedProjectDir, { ...existing.doc, editorVersion });
}

export async function readToolsConfigForScenario(scenarioName) {
  if (!scenarioName) return nullTools();
  const dataRoot = await findDefaultDataRoot();
  if (!dataRoot) return nullTools();
  const project = await findScenarioProject(dataRoot, scenarioName);
  if (!project.ok) return nullTools();
  return readProjectTools(project.projectDir);
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
