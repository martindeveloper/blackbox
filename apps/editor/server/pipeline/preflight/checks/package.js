import { existsSync } from "node:fs";
import { registerPreflightHook } from "../registry.js";
import { resolveAndroidKeystore, resolveSigningTeamId } from "../helpers.js";

registerPreflightHook("package", ({ platform, project, host }) => {
  const checks = [];

  if (platform === "web") {
    return checks;
  }

  if (platform === "ios") {
    if (!host.commandExists("xcodebuild")) {
      checks.push({ severity: "error", message: "Xcode (xcodebuild) not found" });
    }
    if (!project) {
      checks.push({
        severity: "warning",
        message: "scenario.json not loaded — cannot verify iOS signing settings",
      });
      return checks;
    }
    if (!resolveSigningTeamId(project.scenario)) {
      checks.push({
        severity: "error",
        message:
          "missing signing team — set platforms.ios.signing.teamId in scenario.json or APPLE_TEAM_ID",
      });
    }
    return checks;
  }

  if (platform === "android") {
    if (!host.commandExists("java")) {
      checks.push({
        severity: "error",
        message: "Java (JDK) not found — needed by the Gradle wrapper",
      });
    }
    if (!project) {
      checks.push({
        severity: "warning",
        message: "scenario.json not loaded — cannot verify Android keystore settings",
      });
      return checks;
    }

    const keystore = resolveAndroidKeystore(project);
    if (!keystore?.path) {
      checks.push({
        severity: "error",
        message:
          "missing keystore — set platforms.android.keystore.path in scenario.json for release packaging",
      });
      return checks;
    }
    if (!keystore.storePassword || !keystore.keyPassword) {
      checks.push({
        severity: "error",
        message:
          "missing keystore passwords — set ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_PASSWORD or platforms.android.keystore.*Env in scenario.json",
      });
    }
    if (!existsSync(keystore.path)) {
      checks.push({
        severity: "error",
        message: `release keystore not found: ${keystore.path}`,
      });
    }
  }

  return checks;
});
