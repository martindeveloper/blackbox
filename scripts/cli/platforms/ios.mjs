import {
  buildPayload,
  capSyncIos,
  ensureWorkspace,
  packageIos,
} from "../../../apps/mobile/scripts/lib/workspace.mjs";
import { resolvePlatformConfig } from "../../lib/adventure.mjs";
import { fail, log, REPO_ROOT, runBundler, runLint } from "../lib/run.mjs";
import path from "node:path";

export function stageLint(project) {
  runLint(project);
}

export function stageBuild(project, { noBuild = false } = {}) {
  if (process.platform !== "darwin") {
    fail("ios", "iOS builds require macOS with Xcode");
  }
  const adv = toMobileAdv(project);
  buildPayload(adv, { noBuild });
  ensureWorkspace(adv);
  capSyncIos(adv);
  log("build", `ok -> ${path.relative(REPO_ROOT, path.join(adv.buildDir, "ios"))}`);
}

export function stageBundle(project, { configuration = project.configuration ?? "release" } = {}) {
  return runBundler(project, "ios", { configuration });
}

export function stagePackage(project, options = {}) {
  if (process.platform !== "darwin") {
    fail("ios", "iOS packaging requires macOS with Xcode");
  }
  const platformConfig = resolvePlatformConfig(project, "ios");
  if (!platformConfig.signing.teamId) {
    fail(
      "ios",
      "missing signing team — set platforms.ios.signing.teamId in scenario.json or APPLE_TEAM_ID",
    );
  }

  stageBuild(project, options);
  stageBundle(project);

  const adv = toMobileAdv(project);
  return packageIos(adv, platformConfig);
}

function toMobileAdv(project) {
  const platformConfig = resolvePlatformConfig(project, "ios");
  return {
    root: project.root,
    scenario: project.scenarioPath,
    gameId: project.gameId,
    title: project.title,
    buildDir: project.buildDir,
    webWwwDir: project.webWwwDir,
    configuration: project.configuration,
    platform: platformConfig,
  };
}
