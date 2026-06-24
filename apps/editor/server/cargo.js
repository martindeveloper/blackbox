import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { CLIENT_ROOT, PACKAGED, REPO_ROOT, WORK_DIR, getToolsDir, toolBinPath } from "./config.js";

let cargoTargetDirPromise = null;

export function getCargoTargetDir() {
  if (!cargoTargetDirPromise) cargoTargetDirPromise = resolveCargoTargetDir();
  return cargoTargetDirPromise;
}

async function resolveCargoTargetDir() {
  if (process.env.CARGO_TARGET_DIR) {
    const envDir = process.env.CARGO_TARGET_DIR;
    return path.isAbsolute(envDir) ? path.resolve(envDir) : path.join(REPO_ROOT, envDir);
  }

  try {
    const configPath = path.join(REPO_ROOT, ".cargo", "config.toml");
    const text = await fs.readFile(configPath, "utf8");
    const match = /^\s*target-dir\s*=\s*"([^"]+)"/m.exec(text);
    if (match?.[1]) {
      const configured = match[1].trim();
      return path.isAbsolute(configured)
        ? path.resolve(configured)
        : path.join(REPO_ROOT, configured);
    }
  } catch {}

  return path.join(REPO_ROOT, ".cache", "target");
}

export function runProcess(command, args, cwd, extraEnv = {}, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      resolve({ exitCode: -1, stdout: "", stderr: "Process killed" });
      return;
    }

    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
      ...(process.platform === "win32" ? { windowsHide: true } : {}),
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const kill = () => {
      if (!child.killed) child.kill();
    };
    signal?.addEventListener("abort", kill, { once: true });
    child.on("error", reject);
    child.on("close", (code) => {
      signal?.removeEventListener("abort", kill);
      resolve({
        exitCode: signal?.aborted ? -1 : (code ?? 1),
        stdout,
        stderr: signal?.aborted && !stderr.trim() ? "Process killed" : stderr,
      });
    });
  });
}

export async function runCargo(packageName, cargoArgs, { release = false, signal } = {}) {
  const args = ["run", "-p", packageName];
  if (release) args.push("--release");
  args.push("--", ...cargoArgs);
  const cargoTargetDir = await getCargoTargetDir();
  return runProcess("cargo", args, REPO_ROOT, { CARGO_TARGET_DIR: cargoTargetDir }, { signal });
}

export function platformBin(name) {
  if (process.platform !== "win32") return name;
  if (path.extname(name) === "" && !path.isAbsolute(name)) return `${name}.exe`;
  return name;
}

/**
 * Run an engine tool (lint/bundle/simulator), always preferring a prebuilt binary: an explicit
 * configured path, otherwise the bundled tools dir (BLACKBOX_TOOLS_DIR), re-resolved at call time
 * so a value missing from the project's tools doc still finds the shipped binary.
 *
 * cargo is only ever used in a dev checkout. A packaged editor must NEVER invoke cargo — on a
 * machine that happens to have cargo (e.g. a developer's box) `cargo run` would compile from
 * source and appear to hang forever. When packaged with no prebuilt binary we reject with a clear
 * error instead, so the tool run fails visibly rather than spinning indefinitely.
 */
export function runEngineTool(
  configuredPath,
  packageName,
  args,
  { cwd = WORK_DIR, release = false, signal } = {},
) {
  const bin = configuredPath ?? toolBinPath(packageName);
  if (bin) return runProcess(platformBin(bin), args, cwd, {}, { signal });
  if (PACKAGED) {
    return Promise.reject(
      new Error(
        `Bundled ${packageName} binary not found under ${getToolsDir() ?? "(BLACKBOX_TOOLS_DIR unset)"}`,
      ),
    );
  }
  return runCargo(packageName, args, { release, signal });
}

function spawnCwd() {
  for (const candidate of [WORK_DIR, CLIENT_ROOT, REPO_ROOT]) {
    if (existsSync(candidate)) return candidate;
  }
  return process.cwd();
}

export function probeBin(binPath, source) {
  return new Promise((resolve) => {
    const bin = platformBin(binPath);
    const child = spawn(bin, ["--version"], {
      cwd: spawnCwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      ...(process.platform === "win32" ? { windowsHide: true } : {}),
    });
    let stdout = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.on("error", (err) => {
      resolve({
        ok: false,
        source: null,
        error: err.code === "ENOENT" ? "binary not found" : err.message,
      });
    });
    child.on("close", (code) => {
      if (code === 0) {
        const version = /(\d+\.\d+\.\d+)/.exec(stdout.trim())?.[1] ?? stdout.trim();
        resolve({ ok: true, available: true, version, source });
      } else {
        resolve({
          ok: false,
          available: false,
          source,
          error: `--version exited with code ${code}`,
        });
      }
    });
  });
}

export async function discoverOneTool(defaultBinName, configuredBin, configuredSource = "config") {
  if (configuredBin) {
    const result = await probeBin(configuredBin, configuredSource);
    return result.ok ? result : { available: false, source: configuredSource, error: result.error };
  }
  const pathResult = await probeBin(defaultBinName, "path");
  if (pathResult.ok) return pathResult;
  return { available: true, source: "cargo", version: null };
}
