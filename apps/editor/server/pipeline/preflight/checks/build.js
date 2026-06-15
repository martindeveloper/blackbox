import { existsSync } from "node:fs";
import { registerPreflightHook } from "../registry.js";
import { capacitorBin } from "../helpers.js";

registerPreflightHook("build", ({ platform, host }) => {
  const checks = [];
  const isMac = process.platform === "darwin";
  const capacitor = existsSync(capacitorBin());

  if (platform === "web") {
    return checks;
  }

  if (platform === "ios") {
    if (!isMac) {
      checks.push({ severity: "error", message: "iOS builds require macOS" });
    }
    if (!capacitor) {
      checks.push({ severity: "error", message: "Capacitor workspace is missing" });
    }
    if (isMac && !host.commandExists("pod")) {
      checks.push({ severity: "error", message: "CocoaPods not found (gem install cocoapods)" });
    }
    return checks;
  }

  if (platform === "android" && !capacitor) {
    checks.push({ severity: "error", message: "Capacitor workspace is missing" });
  }

  return checks;
});
