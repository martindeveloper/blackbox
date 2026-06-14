import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { CLIENT_ROOT, REPO_ROOT, WORK_DIR } from "./config.js";

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

export function runProcess(command, args, cwd, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
  });
}

export async function runCargo(packageName, cargoArgs, { release = false } = {}) {
  const args = ["run", "-p", packageName];
  if (release) args.push("--release");
  args.push("--", ...cargoArgs);
  const cargoTargetDir = await getCargoTargetDir();
  return runProcess("cargo", args, REPO_ROOT, { CARGO_TARGET_DIR: cargoTargetDir });
}

export function platformBin(name) {
  if (process.platform !== "win32") return name;
  if (path.extname(name) === "" && !path.isAbsolute(name)) return `${name}.exe`;
  return name;
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
