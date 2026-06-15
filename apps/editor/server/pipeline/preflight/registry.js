/** @typedef {"error" | "warning"} PreflightSeverity */
/** @typedef {{ severity: PreflightSeverity, message: string }} PreflightCheck */

/** @type {Map<string, (ctx: unknown) => PreflightCheck[]>} */
const hooks = new Map();

export function registerPreflightHook(stage, fn) {
  hooks.set(stage, fn);
}

export function finalizeStage(checks) {
  const hasError = checks.some((check) => check.severity === "error");
  return {
    available: !hasError,
    checks,
  };
}

export function runStagePreflight(stage, ctx) {
  const hook = hooks.get(stage);
  const checks = hook ? hook(ctx) : [];
  return finalizeStage(checks);
}
