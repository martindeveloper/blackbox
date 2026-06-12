import { spawn, spawnSync } from "node:child_process";

function spawnOptions({ cwd, env = process.env, quiet = false } = {}) {
  return {
    cwd,
    env,
    stdio: quiet ? "pipe" : "inherit",
    encoding: quiet ? "utf8" : undefined,
    // npm, npx, and other Windows shims are .cmd files and need a shell.
    shell: process.platform === "win32",
  };
}

export function commandExists(command) {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(checker, [command], {
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

export function runSync(command, args, options = {}) {
  const result = spawnSync(command, args, spawnOptions(options));
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
    const child = spawn(command, args, spawnOptions(options));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? 1}`));
    });
  });
}

export function capture(command, args, options = {}) {
  const result = spawnSync(command, args, spawnOptions({ ...options, quiet: true }));
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status ?? 1}`);
  }
  return result.stdout;
}
