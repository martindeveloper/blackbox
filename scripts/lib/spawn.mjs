import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/** Append .exe to absolute Windows paths when the file exists. */
function normalizeWindowsCommand(command) {
  const cmd = String(command);
  if (process.platform !== "win32") return cmd;
  const ext = path.extname(cmd).toLowerCase();
  if (ext) return cmd;
  if (!path.isAbsolute(cmd)) return cmd;
  const withExe = `${cmd}.exe`;
  return existsSync(withExe) ? withExe : cmd;
}

// Windows .cmd/.bat shims (npm, npx) need a shell when looked up by bare name.
// Direct .exe invocations and absolute paths must avoid shell so Program Files /
// WindowsApps / AppData paths with spaces are not split by cmd.exe.
export function needsShell(command) {
  if (process.platform !== "win32") return false;
  const cmd = normalizeWindowsCommand(String(command));
  const ext = path.extname(cmd).toLowerCase();
  if (ext === ".exe" || ext === ".com") return false;
  if (path.isAbsolute(cmd)) return false;
  if (ext === ".cmd" || ext === ".bat") return true;
  return ext === "";
}

/** Suppress transient console windows when spawning children on Windows. */
export function windowsSpawnOptions() {
  return process.platform === "win32" ? { windowsHide: true } : {};
}

function npmCliCandidates(cwd, cliFile) {
  const roots = new Set();
  if (cwd) roots.add(cwd);
  if (process.env.BLACKBOX_CLI_DIR) {
    roots.add(process.env.BLACKBOX_CLI_DIR);
    roots.add(path.join(process.env.BLACKBOX_CLI_DIR, "apps", "web"));
  }
  roots.add(path.dirname(process.execPath));
  return [...roots].map((root) => path.join(root, "node_modules", "npm", "bin", cliFile));
}

function whereAll(command) {
  if (process.platform !== "win32") return [];
  const result = spawnSync("where.exe", [command], {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
    ...windowsSpawnOptions(),
  });
  if (result.status !== 0) return [];
  return String(result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function npmCliBesideShim(shimDir, cliFile) {
  const candidates = [
    path.join(shimDir, "node_modules", "npm", "bin", cliFile),
    path.join(shimDir, cliFile),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function resolveNpmSpawn(command, args, { cwd } = {}) {
  if (process.platform !== "win32") return null;
  const name = String(command).toLowerCase();
  if (name !== "npm" && name !== "npx") return null;
  const cliFile = name === "npx" ? "npx-cli.js" : "npm-cli.js";
  for (const cli of npmCliCandidates(cwd, cliFile)) {
    if (existsSync(cli)) {
      return { command: process.execPath, args: [cli, ...args], shell: false };
    }
  }

  // Packaged editors may not ship npm next to their runtime. Resolve the npm
  // shim from PATH and invoke its real *-cli.js with node (shell disabled).
  // Windows Node installs place the CLI at
  // <nodejs>/node_modules/npm/bin/npm-cli.js — not beside npm.cmd.
  for (const shim of whereAll(name)) {
    const cli = npmCliBesideShim(path.dirname(shim), cliFile);
    if (cli) return { command: process.execPath, args: [cli, ...args], shell: false };
  }

  return null;
}

function resolveSpawn(command, args, options = {}) {
  const npm = resolveNpmSpawn(command, args, options);
  if (npm) return npm;
  const normalized = normalizeWindowsCommand(command);
  return {
    command: normalized,
    args,
    shell: needsShell(normalized),
  };
}

function spawnOptions(command, args, { cwd, env = process.env, quiet = false } = {}) {
  const resolved = resolveSpawn(command, args, { cwd });
  return {
    command: resolved.command,
    args: resolved.args,
    options: {
      cwd,
      env,
      stdio: quiet ? "pipe" : "inherit",
      encoding: quiet ? "utf8" : undefined,
      shell: resolved.shell,
      ...windowsSpawnOptions(),
    },
  };
}

export function commandExists(command) {
  const checker = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(checker, [command], {
    stdio: "ignore",
    shell: false,
    ...windowsSpawnOptions(),
  });
  return result.status === 0;
}

export function runSync(command, args, options = {}) {
  const { command: cmd, args: spawnArgs, options: spawnOpts } = spawnOptions(command, args, options);
  const result = spawnSync(cmd, spawnArgs, spawnOpts);
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
  const { command: cmd, args: spawnArgs, options: spawnOpts } = spawnOptions(command, args, options);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, spawnArgs, spawnOpts);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? 1}`));
    });
  });
}

export function capture(command, args, options = {}) {
  const { command: cmd, args: spawnArgs, options: spawnOpts } = spawnOptions(command, args, {
    ...options,
    quiet: true,
  });
  const result = spawnSync(cmd, spawnArgs, spawnOpts);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status ?? 1}`);
  }
  return result.stdout;
}
