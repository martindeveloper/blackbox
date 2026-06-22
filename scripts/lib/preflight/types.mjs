/** @typedef {"error" | "warning"} PreflightSeverity */
/** @typedef {{ severity: PreflightSeverity, message: string }} PreflightCheck */

/** @typedef {{ commandExists: (command: string) => Promise<boolean> }} HostCache */
/** @typedef {ReturnType<typeof import("../adventure.mjs").resolveProject>} AdventureProject */
/** @typedef {{ projectPath: string | null, project: AdventureProject | null, host: HostCache }} PreflightContext */

/**
 * @param {PreflightCheck[]} checks
 */
export function finalizeStage(checks) {
  const hasError = checks.some((check) => check.severity === "error");
  return {
    available: !hasError,
    checks,
  };
}
