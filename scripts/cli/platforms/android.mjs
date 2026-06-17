import { existsSync } from "node:fs";
import { resolvePlatformConfig } from "../../lib/adventure.mjs";
import { sharedBundleChecks } from "../../lib/preflight/bundleCommon.mjs";
import { capacitorBin } from "../../lib/preflight/context.mjs";
import { requireStageReady, requireStagesReady } from "../../lib/preflight/index.mjs";
import { toMobileAdv } from "../lib/mobileAdv.mjs";
import { log, displayPath, runBundler, runLint, runScriptsLint } from "../lib/run.mjs";
import {
  androidRootFor,
  buildPayload,
  capSyncAndroid,
  packageAndroid,
} from "../../../apps/mobile/scripts/lib/workspace.mjs";

/** @typedef {import("../../lib/preflight/types.mjs").PreflightContext} PreflightContext */

export const preflight = {
  /** @param {PreflightContext} ctx */
  bundle: (ctx) => sharedBundleChecks(ctx),
  /** @param {PreflightContext} ctx */
  async build(ctx) {
    const checks = [];
    if (!existsSync(capacitorBin())) {
      checks.push({ severity: "error", message: "Capacitor workspace is missing" });
    }
    return checks;
  },
  /** @param {PreflightContext} ctx */
  async package(ctx) {
    const checks = [];

    if (!(await ctx.host.commandExists("java"))) {
      checks.push({
        severity: "error",
        message: "Java (JDK) not found — needed by the Gradle wrapper",
      });
    }
    if (!ctx.project) {
      checks.push({
        severity: "warning",
        message: "scenario.json not loaded — cannot verify Android keystore settings",
      });
      return checks;
    }

    const config = resolvePlatformConfig(ctx.project, "android");
    if (!config.keystore?.path) {
      checks.push({
        severity: "error",
        message:
          "missing keystore — set platforms.android.keystore.path in scenario.json for release packaging",
      });
      return checks;
    }
    if (!config.keystore.storePassword || !config.keystore.keyPassword) {
      checks.push({
        severity: "error",
        message:
          "missing keystore passwords — set ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_PASSWORD or platforms.android.keystore.*Env in scenario.json",
      });
    }
    if (!existsSync(config.keystore.path)) {
      checks.push({
        severity: "error",
        message: `release keystore not found: ${config.keystore.path}`,
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
    await requireStageReady("android", "build", project);
  }
  const adv = toMobileAdv(project, "android");
  buildPayload(adv, { noBuild, platform: "android" });
  await capSyncAndroid(adv);
  log("build", `ok -> ${displayPath(androidRootFor(adv))}`);
}

export async function stageBundle(
  project,
  { configuration = project.configuration ?? "release", skipPreflight = false } = {},
) {
  if (!skipPreflight) {
    await requireStageReady("android", "bundle", project);
  }
  return runBundler(project, "android", { configuration });
}

export async function stagePackage(project, options = {}) {
  await requireStagesReady("android", ["package", "build", "bundle"], project);

  await stageBuild(project, { ...options, skipPreflight: true });
  await stageBundle(project, { skipPreflight: true });

  const adv = toMobileAdv(project, "android");
  const platformConfig = resolvePlatformConfig(project, "android");
  return packageAndroid(adv, platformConfig);
}
