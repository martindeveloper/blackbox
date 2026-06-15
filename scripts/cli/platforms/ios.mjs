import {
  buildPayload,
  capSyncIos,
  packageIos,
} from "../../../apps/mobile/scripts/lib/workspace.mjs";
import { resolvePlatformConfig } from "../../lib/adventure.mjs";
import { toMobileAdv } from "../lib/mobileAdv.mjs";
import { fail, log, REPO_ROOT, runBundler, runLint, runScriptsLint } from "../lib/run.mjs";
import path from "node:path";

export function stageLint(project) {
  runLint(project);
  runScriptsLint();
}

export async function stageBuild(project, { noBuild = false } = {}) {
  if (process.platform !== "darwin") {
    fail("ios", "iOS builds require macOS with Xcode");
  }
  const adv = toMobileAdv(project, "ios");
  buildPayload(adv, { noBuild, platform: "ios" });
  await capSyncIos(adv);
  log("build", `ok -> ${path.relative(REPO_ROOT, path.join(adv.buildDir, "ios"))}`);
}

export function stageBundle(project, { configuration = project.configuration ?? "release" } = {}) {
  return runBundler(project, "ios", { configuration });
}

export async function stagePackage(project, options = {}) {
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

  await stageBuild(project, options);
  stageBundle(project);

  const adv = toMobileAdv(project, "ios");
  return packageIos(adv, platformConfig);
}
