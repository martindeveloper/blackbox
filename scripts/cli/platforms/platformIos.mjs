import { existsSync } from "node:fs";
import path from "node:path";
import { resolvePlatformConfig } from "../../lib/adventure.mjs";
import { validateIosSdkConfig } from "../../lib/platformIos.mjs";
import { sharedBundleChecks } from "../../lib/preflight/bundleCommon.mjs";
import { capacitorBin } from "../../lib/preflight/context.mjs";
import { toMobileAdv } from "../lib/mobileAdv.mjs";
import { displayPath, log, runBundler, runLint, runScriptsLint } from "../lib/run.mjs";
import {
  buildPayload,
  capOpenIos,
  capRunIos,
  capSyncIos,
  packageIos,
} from "../../../apps/mobile/scripts/lib/workspace.mjs";

export const name = "ios";

export async function preflightCheck(stage, ctx) {
  if (stage === "lint") return [];
  if (stage === "bundle") return sharedBundleChecks(ctx, { iosAudio: true });

  const checks = [];
  if (process.platform !== "darwin") {
    checks.push({ severity: "error", message: "iOS builds require macOS" });
  }

  if (stage === "build") {
    if (!existsSync(capacitorBin())) {
      checks.push({ severity: "error", message: "Capacitor workspace is missing" });
    }
    if (process.platform === "darwin" && !(await ctx.host.commandExists("pod"))) {
      checks.push({ severity: "error", message: "CocoaPods not found (gem install cocoapods)" });
    }
    if (ctx.project) {
      checks.push(
        ...validateIosSdkConfig(ctx.project.scenario.platforms?.ios ?? {}),
      );
    }
  }

  if (stage === "package") {
    if (!(await ctx.host.commandExists("xcodebuild"))) {
      checks.push({ severity: "error", message: "Xcode (xcodebuild) not found" });
    }
    if (!ctx.project) {
      checks.push({
        severity: "warning",
        message: "scenario.json not loaded — cannot verify iOS signing settings",
      });
    } else if (!resolvePlatformConfig(ctx.project, "ios").signing.teamId) {
      checks.push({
        severity: "error",
        message:
          "missing signing team — set platforms.ios.signing.teamId in scenario.json or APPLE_TEAM_ID",
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
  await capSyncIos(adv);
  return path.join(adv.buildDir, "ios");
}

export function afterBuild({ artifact }) {
  log("build", `ok -> ${displayPath(artifact)}`);
}

export function executePackage({ project, options }) {
  if (!existsSync(options.buildInput) || !existsSync(options.bundleInput)) {
    throw new Error("iOS Package requires valid Build and Bundle artifacts");
  }
  const adv = toMobileAdv(project, name);
  return packageIos(adv, resolvePlatformConfig(project, name));
}

export function open(project) {
  capOpenIos(toMobileAdv(project, name));
}

export function run(project) {
  capRunIos(toMobileAdv(project, name));
}
