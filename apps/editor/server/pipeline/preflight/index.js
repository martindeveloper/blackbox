import "./checks/bundle.js";
import "./checks/build.js";
import "./checks/package.js";
import { createHostCache, loadProjectContext } from "./helpers.js";
import { BUILD_STAGES } from "../../../shared/buildStages.js";
import { runStagePreflight } from "./registry.js";

const PLATFORMS = ["web", "ios", "android"];

function buildPlatformPreflight(platform, ctx) {
  const stages = Object.fromEntries(
    BUILD_STAGES.map((stage) => [stage, runStagePreflight(stage, { ...ctx, platform })]),
  );
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
 * Run pre-flight checks for every build platform. Each pipeline stage registers hooks that
 * inspect host tools and, when a project path is provided, scenario-specific settings.
 */
export function detectBuildCapabilities(projectPath) {
  const ctx = {
    projectPath: projectPath ? String(projectPath) : null,
    project: loadProjectContext(projectPath),
    host: createHostCache(),
  };

  return Object.fromEntries(
    PLATFORMS.map((platform) => [platform, buildPlatformPreflight(platform, ctx)]),
  );
}
