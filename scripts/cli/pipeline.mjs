import { resolveProject } from "../lib/adventure.mjs";
import { getPlatform } from "./platforms/index.mjs";
import { STAGES } from "./stages/index.mjs";

export function resolvePipeline({ project: projectPath, platform: platformName, configuration }) {
  const platform = getPlatform(platformName);
  if (!platform) {
    throw new Error(`unknown platform "${platformName}" — expected web, ios, or android`);
  }
  const project = resolveProject(projectPath, { configuration });
  return { platform, project };
}

export async function executeStage({
  stage,
  project: projectPath,
  platform: platformName,
  configuration,
  options = {},
}) {
  const resolved = resolvePipeline({
    project: projectPath,
    platform: platformName,
    configuration,
  });
  return executeResolvedStage({
    stage,
    platform: resolved.platform,
    project: resolved.project,
    options: {
      ...options,
      configuration,
    },
  });
}

export function executeResolvedStage({ stage, platform, project, options = {} }) {
  const handler = STAGES[stage];
  if (!handler) {
    throw new Error(`unknown stage "${stage}" — expected lint, build, bundle, or package`);
  }
  return handler(platform, project, {
    ...options,
    configuration: options.configuration ?? project.configuration,
  });
}

export async function executePlatformCommand({
  command,
  project: projectPath,
  platform: platformName,
  configuration,
}) {
  const { platform, project } = resolvePipeline({
    project: projectPath,
    platform: platformName,
    configuration,
  });
  const handler = platform[command];
  if (!handler) {
    throw new Error(`platform "${platformName}" does not support command "${command}"`);
  }
  return handler(project, { configuration });
}
