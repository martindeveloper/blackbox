import { existsSync } from "node:fs";
import path from "node:path";
import { commandExists } from "../../../../scripts/lib/spawn.mjs";
import { getCliDir } from "../config.js";

function capacitorBin() {
  const name = process.platform === "win32" ? "cap.cmd" : "cap";
  return path.join(getCliDir(), "apps", "mobile", "node_modules", ".bin", name);
}

/**
 * Report which platforms the editor can build right now, plus whether the host has the
 * external toolchains needed to package (xcodebuild for iOS, a JDK for Android's gradlew).
 * The editor bundles the build orchestration + Capacitor but never bundles those SDKs — it
 * uses them if installed and surfaces their absence as friendly warnings, not spawn failures.
 *
 * `available`/`reasons` gate the build+bundle stages; `package` reports the extra packaging
 * prerequisites so the UI can warn without blocking an upstream-only run.
 */
export function detectBuildCapabilities() {
  const isMac = process.platform === "darwin";
  const capacitor = existsSync(capacitorBin());
  const cocoapods = isMac && commandExists("pod");
  const xcodebuild = isMac && commandExists("xcodebuild");
  const java = commandExists("java");

  return {
    web: {
      available: true,
      reasons: [],
      package: { available: true, reasons: [] },
    },
    ios: {
      available: isMac && capacitor && cocoapods,
      reasons: [
        ...(isMac ? [] : ["iOS builds require macOS"]),
        ...(capacitor ? [] : ["Capacitor workspace is missing"]),
        ...(isMac && !cocoapods ? ["CocoaPods not found (gem install cocoapods)"] : []),
      ],
      package: {
        available: xcodebuild,
        reasons: [
          ...(xcodebuild ? [] : ["Xcode (xcodebuild) not found"]),
          "Packaging needs platforms.ios.signing.teamId (or APPLE_TEAM_ID)",
        ],
      },
    },
    android: {
      available: capacitor,
      reasons: capacitor ? [] : ["Capacitor workspace is missing"],
      package: {
        available: java,
        reasons: [
          ...(java ? [] : ["Java (JDK) not found — needed by the Gradle wrapper"]),
          "Packaging needs platforms.android.keystore in scenario.json",
        ],
      },
    },
  };
}
