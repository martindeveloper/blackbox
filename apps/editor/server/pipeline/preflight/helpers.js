import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { commandExists as probeCommandExists } from "../../sharedLib.mjs";
import { getCliDir } from "../../config.js";

function readFfmpegEncoders() {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-encoders"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) return "";
  return result.stdout.toLowerCase();
}

/** Per-request cache for host tool probes shared across platform/stage hooks. */
export function createHostCache() {
  const commands = new Map();
  let encoders;

  return {
    commandExists(command) {
      if (!commands.has(command)) {
        commands.set(command, probeCommandExists(command));
      }
      return commands.get(command);
    },
    ffmpegEncoders() {
      if (encoders === undefined) {
        encoders = readFfmpegEncoders();
      }
      return encoders;
    },
  };
}

export function toolInstallHint(tool, brewPackage) {
  if (process.platform === "darwin") {
    return `${tool} not found (brew install ${brewPackage})`;
  }
  return `${tool} not found — install ${tool} and ensure it is on PATH`;
}

export function capacitorBin() {
  const name = process.platform === "win32" ? "cap.cmd" : "cap";
  return path.join(getCliDir(), "apps", "mobile", "node_modules", ".bin", name);
}

function resolveEnvValue(value, { required = false } = {}) {
  if (typeof value !== "string") return value;
  if (value.startsWith("env:")) {
    const name = value.slice(4);
    const fromEnv = process.env[name];
    if (!fromEnv && required) return null;
    return fromEnv ?? null;
  }
  return value;
}

function resolveMaybeEnvObject(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = { ...obj };
  for (const key of ["storePassword", "keyPassword", "password"]) {
    if (typeof out[key] === "string") {
      out[key] = resolveEnvValue(out[key], { required: false });
    }
  }
  for (const key of ["storePasswordEnv", "keyPasswordEnv", "passwordEnv"]) {
    if (typeof out[key] === "string") {
      const envName = out[key];
      const target = key.replace(/Env$/, "");
      out[target] = process.env[envName] ?? null;
    }
  }
  return out;
}

export function loadProjectContext(projectPath) {
  if (!projectPath) return null;
  const root = path.resolve(projectPath);
  const scenarioPath = path.join(root, "scenario.json");
  if (!existsSync(scenarioPath)) return null;
  try {
    const scenario = JSON.parse(readFileSync(scenarioPath, "utf8"));
    return { root, scenarioPath, scenario };
  } catch {
    return null;
  }
}

export function resolveSigningTeamId(scenario) {
  const signing = resolveMaybeEnvObject(scenario?.platforms?.ios?.signing ?? {});
  return resolveEnvValue(signing.teamId, { required: false }) ?? process.env.APPLE_TEAM_ID ?? null;
}

export function resolveAndroidKeystore(project) {
  const raw = project?.scenario?.platforms?.android?.keystore;
  const keystore = resolveMaybeEnvObject(raw);
  if (!keystore?.path) return null;
  return {
    ...keystore,
    path: path.resolve(project.root, keystore.path),
  };
}
