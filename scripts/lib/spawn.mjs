import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

// Windows .cmd/.bat shims (npm, npx) need a shell. Direct .exe invocations must
// avoid shell so paths with spaces (e.g. AppData\Blackbox Editor\.cache) are not split.
export function needsShell(command) {
  if (process.platform !== "win32") return false;
  const ext = path.extname(String(command)).toLowerCase();
  if (ext === ".exe") return false;
  if (ext === ".cmd" || ext === ".bat") return true;
  // Extensionless command — PATH may resolve to a .cmd shim.
  return ext === "";
}

/** Suppress transient console windows when spawning children on Windows. */
export function windowsSpawnOptions() {
  return process.platform === "win32" ? { windowsHide: true } : {};
}

function spawnOptions(command, { cwd, env = process.env, quiet = false } = {}) {
  return {
    cwd,
    env,
    stdio: quiet ? "pipe" : "inherit",
    encoding: quiet ? "utf8" : undefined,
    shell: needsShell(command),
    ...windowsSpawnOptions(),
  };
}

export function commandExists(command) {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(checker, [command], {
    stdio: "ignore",
    shell: needsShell(checker),
    ...windowsSpawnOptions(),
  });
  return result.status === 0;
}

export function runSync(command, args, options = {}) {
  const result = spawnSync(command, args, spawnOptions(command, options));
  if (result.error) {
    console.error(`error: failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result;
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, spawnOptions(command, options));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? 1}`));
    });
  });
}

export function capture(command, args, options = {}) {
  const result = spawnSync(command, args, spawnOptions(command, { ...options, quiet: true }));
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status ?? 1}`);
  }
  return result.stdout;
}
