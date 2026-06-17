import { existsSync } from "node:fs";
import { resolvePlatformConfig } from "../../lib/adventure.mjs";
import { sharedBundleChecks } from "../../lib/preflight/bundleCommon.mjs";
import { capacitorBin } from "../../lib/preflight/context.mjs";
import { requireStageReady, requireStagesReady } from "../../lib/preflight/index.mjs";
import { toMobileAdv } from "../lib/mobileAdv.mjs";
import { log, REPO_ROOT, runBundler, runLint, runScriptsLint } from "../lib/run.mjs";
import path from "node:path";
import {
  buildPayload,
  capSyncIos,
  packageIos,
} from "../../../apps/mobile/scripts/lib/workspace.mjs";

/** @typedef {import("../../lib/preflight/types.mjs").PreflightContext} PreflightContext */

export const preflight = {
  /** @param {PreflightContext} ctx */
  bundle: (ctx) => sharedBundleChecks(ctx, { iosAudio: true }),
  /** @param {PreflightContext} ctx */
  async build(ctx) {
    const checks = [];
    const isMac = process.platform === "darwin";
    const capacitor = existsSync(capacitorBin());

    if (!isMac) {
      checks.push({ severity: "error", message: "iOS builds require macOS" });
    }
    if (!capacitor) {
      checks.push({ severity: "error", message: "Capacitor workspace is missing" });
    }
    if (isMac && !(await ctx.host.commandExists("pod"))) {
      checks.push({ severity: "error", message: "CocoaPods not found (gem install cocoapods)" });
    }
    return checks;
  },
  /** @param {PreflightContext} ctx */
  async package(ctx) {
    const checks = [];

    if (process.platform !== "darwin") {
      checks.push({ severity: "error", message: "iOS builds require macOS" });
    }
    if (!(await ctx.host.commandExists("xcodebuild"))) {
      checks.push({ severity: "error", message: "Xcode (xcodebuild) not found" });
    }
    if (!ctx.project) {
      checks.push({
        severity: "warning",
        message: "scenario.json not loaded — cannot verify iOS signing settings",
      });
      return checks;
    }

    const config = resolvePlatformConfig(ctx.project, "ios");
    if (!config.signing.teamId) {
      checks.push({
        severity: "error",
        message:
          "missing signing team — set platforms.ios.signing.teamId in scenario.json or APPLE_TEAM_ID",
      });
    }
    return checks;
  },
};

export function stageLint(project) {
  runLint(project);
  runScriptsLint();
}

export async function stageBuild(project, { noBuild = false, skipPreflight = false } = {}) {
  if (!skipPreflight) {
    await requireStageReady("ios", "build", project);
  }
  const adv = toMobileAdv(project, "ios");
  buildPayload(adv, { noBuild, platform: "ios" });
  await capSyncIos(adv);
  log("build", `ok -> ${path.relative(REPO_ROOT, path.join(adv.buildDir, "ios"))}`);
}

export async function stageBundle(
  project,
  { configuration = project.configuration ?? "release", skipPreflight = false } = {},
) {
  if (!skipPreflight) {
    await requireStageReady("ios", "bundle", project);
  }
  return runBundler(project, "ios", { configuration });
}

export async function stagePackage(project, options = {}) {
  await requireStagesReady("ios", ["package", "build", "bundle"], project);

  await stageBuild(project, { ...options, skipPreflight: true });
  await stageBundle(project, { skipPreflight: true });

  const adv = toMobileAdv(project, "ios");
  const platformConfig = resolvePlatformConfig(project, "ios");
  return packageIos(adv, platformConfig);
}
