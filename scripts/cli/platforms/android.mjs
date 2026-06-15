import {
  androidRootFor,
  buildPayload,
  capSyncAndroid,
  packageAndroid,
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
  const adv = toMobileAdv(project, "android");
  buildPayload(adv, { noBuild, platform: "android" });
  await capSyncAndroid(adv);
  log("build", `ok -> ${path.relative(REPO_ROOT, androidRootFor(adv))}`);
}

export function stageBundle(project, { configuration = project.configuration ?? "release" } = {}) {
  return runBundler(project, "android", { configuration });
}

export async function stagePackage(project, options = {}) {
  const platformConfig = resolvePlatformConfig(project, "android");
  if (!platformConfig.keystore?.path) {
    fail(
      "android",
      "missing keystore — set platforms.android.keystore.path in scenario.json for release packaging",
    );
  }
  if (!platformConfig.keystore.storePassword || !platformConfig.keystore.keyPassword) {
    fail(
      "android",
      "missing keystore passwords — set ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_PASSWORD or platforms.android.keystore.*Env in scenario.json",
    );
  }

  await stageBuild(project, options);
  stageBundle(project);

  const adv = toMobileAdv(project, "android");
  return packageAndroid(adv, platformConfig);
}
