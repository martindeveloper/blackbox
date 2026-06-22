import { existsSync } from "node:fs";
import { resolvePlatformConfig } from "../../lib/adventure.mjs";
import { validateAndroidSdkConfig } from "../../lib/platformAndroid.mjs";
import { capacitorBin } from "../../lib/preflight/context.mjs";
import { toMobileAdv } from "../lib/mobileAdv.mjs";
import { displayPath, log, runBundler, runLint, runScriptsLint } from "../lib/run.mjs";
import {
  androidRootFor,
  buildPayload,
  capOpenAndroid,
  capRunAndroid,
  capSyncAndroid,
  packageAndroid,
} from "../../../apps/mobile/scripts/lib/workspace.mjs";

export const name = "android";

export async function preflightCheck(stage, ctx) {
  if (stage === "lint") return [];
  if (stage === "bundle") return [];
  if (stage === "build") {
    const checks = existsSync(capacitorBin())
      ? []
      : [{ severity: "error", message: "Capacitor workspace is missing" }];
    if (ctx.project) {
      checks.push(
        ...validateAndroidSdkConfig(ctx.project.scenario.platforms?.android ?? {}),
      );
    }
    return checks;
  }

  const checks = [];
  if (!(await ctx.host.commandExists("java"))) {
    checks.push({ severity: "error", message: "Java (JDK) not found — needed by Gradle" });
  }
  if (!ctx.project) {
    checks.push({
      severity: "warning",
      message: "scenario.json not loaded — cannot verify Android keystore settings",
    });
    return checks;
  }

  const config = resolvePlatformConfig(ctx.project, name);
  if (!config.keystore?.path) {
    checks.push({
      severity: "error",
      message: "missing keystore — set platforms.android.keystore.path in scenario.json",
    });
  } else {
    if (!config.keystore.storePassword || !config.keystore.keyPassword) {
      checks.push({
        severity: "error",
        message:
          "missing keystore passwords — set ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_PASSWORD",
      });
    }
    if (!existsSync(config.keystore.path)) {
      checks.push({
        severity: "error",
        message: `release keystore not found: ${config.keystore.path}`,
      });
    }
  }
  return checks;
}

export function executeLint({ project }) {
  runLint(project);
  runScriptsLint();
}

export function executeBundle({ project, options }) {
  return runBundler(project, name, { configuration: options.configuration });
}

export async function executeBuild({ project, options }) {
  const adv = toMobileAdv(project, name);
  buildPayload(adv, {
    noBuild: options.noBuild,
    platform: name,
    bundleInput: options.bundleInput,
  });
  await capSyncAndroid(adv);
  return androidRootFor(adv);
}

export function afterBuild({ artifact }) {
  log("build", `ok -> ${displayPath(artifact)}`);
}

export function executePackage({ project, options }) {
  if (!existsSync(options.buildInput) || !existsSync(options.bundleInput)) {
    throw new Error("Android Package requires valid Build and Bundle artifacts");
  }
  const adv = toMobileAdv(project, name);
  return packageAndroid(adv, resolvePlatformConfig(project, name));
}

export function open(project) {
  capOpenAndroid(toMobileAdv(project, name));
}

export function run(project) {
  capRunAndroid(toMobileAdv(project, name));
}
