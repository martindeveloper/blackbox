import {
  buildPayload,
  capSyncAndroid,
  ensureWorkspace,
  packageAndroid,
} from "../../../apps/mobile/scripts/lib/workspace.mjs";
import { resolvePlatformConfig } from "../../lib/adventure.mjs";
import { fail, log, REPO_ROOT, runBundler, runLint } from "../lib/run.mjs";
import path from "node:path";

export function stageLint(project) {
  runLint(project);
}

export function stageBuild(project, { noBuild = false } = {}) {
  const adv = toMobileAdv(project);
  buildPayload(adv, { noBuild });
  ensureWorkspace(adv);
  capSyncAndroid(adv);
  log("build", `ok -> ${path.relative(REPO_ROOT, path.join(adv.buildDir, "android"))}`);
}

export function stageBundle(project, { configuration = project.configuration ?? "release" } = {}) {
  return runBundler(project, "android", { configuration });
}

export function stagePackage(project, options = {}) {
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

  stageBuild(project, options);
  stageBundle(project);

  const adv = toMobileAdv(project);
  return packageAndroid(adv, platformConfig);
}

function toMobileAdv(project) {
  const platformConfig = resolvePlatformConfig(project, "android");
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
