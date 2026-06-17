import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BUILD_PLATFORMS, BUILD_STAGES } from "../buildStages.mjs";
import { createPreflightContext, createPreflightContextFromProject } from "./context.mjs";
import { finalizeStage } from "./types.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** @type {Promise<(scope: string, msg: string) => never> | null} */
let failPromise;

function platformRoot() {
  if (process.env.BLACKBOX_CLI_DIR) {
    return path.join(path.resolve(process.env.BLACKBOX_CLI_DIR), "scripts", "cli", "platforms");
  }
  return path.resolve(HERE, "../../cli/platforms");
}

/** @returns {Promise<Record<string, { preflight: Record<string, Function> }>>} */
async function loadPlatformModules() {
  const root = platformRoot();
  const entries = await Promise.all(
    BUILD_PLATFORMS.map(async (name) => [
      name,
      await import(pathToFileURL(path.join(root, `${name}.mjs`)).href),
    ]),
  );
  return Object.fromEntries(entries);
}

/** @type {Promise<Record<string, { preflight: Record<string, Function> }>> | null} */
let platformsPromise;

function getPlatforms() {
  if (!platformsPromise) {
    platformsPromise = loadPlatformModules();
  }
  return platformsPromise;
}

function loadFail() {
  if (!failPromise) {
    const runPath = process.env.BLACKBOX_CLI_DIR
      ? path.join(path.resolve(process.env.BLACKBOX_CLI_DIR), "scripts", "cli", "lib", "run.mjs")
      : path.resolve(HERE, "../../cli/lib/run.mjs");
    failPromise = import(pathToFileURL(runPath).href).then((mod) => mod.fail);
  }
  return failPromise;
}

async function stageHandler(platform, stage) {
  const platforms = await getPlatforms();
  const handler = platforms[platform]?.preflight?.[stage];
  if (!handler) {
    throw new Error(`unknown stage "${stage}" for platform "${platform}"`);
  }
  return handler;
}

/**
 * @param {string} platform
 * @param {import("./types.mjs").PreflightContext} ctx
 */
async function runPlatformPreflight(platform, ctx) {
  const platforms = await getPlatforms();
  const handlers = platforms[platform].preflight;
  const stageEntries = await Promise.all(
    BUILD_STAGES.map(async (stage) => [
      stage,
      finalizeStage(await handlers[stage](ctx)),
    ]),
  );
  const stages = Object.fromEntries(stageEntries);
  const buildErrors = stages.build.checks
    .filter((check) => check.severity === "error")
    .map((check) => check.message);

  return {
    available: stages.build.available,
    reasons: buildErrors,
    stages,
  };
}

/**
 * Run pre-flight checks for every build platform.
 * @param {string | null | undefined} projectPath
 */
export async function detectBuildCapabilities(projectPath) {
  const ctx = createPreflightContext(projectPath);
  const entries = await Promise.all(
    BUILD_PLATFORMS.map(async (platform) => [platform, await runPlatformPreflight(platform, ctx)]),
  );
  return Object.fromEntries(entries);
}

/**
 * Run pre-flight checks for one platform stage and throw on the first error.
 * @param {string} platform
 * @param {string} stage
 * @param {ReturnType<typeof import("../adventure.mjs").resolveProject>} project
 * @param {import("./types.mjs").PreflightContext=} ctx
 */
export async function assertStageReady(platform, stage, project, ctx) {
  const context = ctx ?? createPreflightContextFromProject(project);
  const handler = await stageHandler(platform, stage);
  const checks = await handler(context);
  const error = checks.find((check) => check.severity === "error");
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * @param {string} platform
 * @param {string} stage
 * @param {ReturnType<typeof import("../adventure.mjs").resolveProject>} project
 * @param {import("./types.mjs").PreflightContext=} ctx
 */
export async function requireStageReady(platform, stage, project, ctx) {
  try {
    await assertStageReady(platform, stage, project, ctx);
  } catch (error) {
    const fail = await loadFail();
    fail(platform, error.message);
  }
}

/**
 * @param {string} platform
 * @param {string[]} stages
 * @param {ReturnType<typeof import("../adventure.mjs").resolveProject>} project
 */
export async function requireStagesReady(platform, stages, project) {
  const ctx = createPreflightContextFromProject(project);
  for (const stage of stages) {
    await requireStageReady(platform, stage, project, ctx);
  }
}

export { createHostCache } from "./host.mjs";
export { createPreflightContextFromProject } from "./context.mjs";
