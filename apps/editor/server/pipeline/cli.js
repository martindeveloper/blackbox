import { spawn } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import {
  BUILD_CONFIGURATIONS,
  BUILD_PLATFORMS,
  stagesForPlatform,
} from "../../shared/buildStages.js";
import { getCliDir, getToolsDir, toolBinPath, bundledToolsEnabled } from "../config.js";

export function isValidPlatform(value) {
  return BUILD_PLATFORMS.includes(value);
}

export function isValidConfiguration(value) {
  return BUILD_CONFIGURATIONS.includes(value);
}

export function isStageAllowed(stage, platform) {
  return stagesForPlatform(platform).includes(stage);
}

function buildDir(projectPath, configuration) {
  return path.join(projectPath, ".blackbox", "build", configuration);
}

/**
 * Remove the project's build output for a configuration so the next build runs from scratch.
 * This is the `.blackbox/build/<configuration>` tree (bundle/web/package artifacts and any
 * incremental output the stages wrote there). Returns the directory that was cleaned.
 */
export function cleanBuildOutput(projectPath, configuration) {
  const dir = buildDir(projectPath, configuration);
  rmSync(dir, { recursive: true, force: true });
  return dir;
}

function stageOutputDir(projectPath, platform, stage, configuration) {
  const root = buildDir(projectPath, configuration);
  if (stage === "bundle") return path.join(root, "bundle", platform);
  if (stage === "package") return path.join(root, "package", platform);
  if (platform === "web") return path.join(root, "web", "www");
  if (platform === "ios") return path.join(root, "ios");
  return path.join(root, "android");
}

function findFirst(dir, predicate) {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && predicate(entry.name)) return full;
    if (entry.isDirectory()) {
      const nested = findFirst(full, predicate);
      if (nested) return nested;
    }
  }
  return null;
}

function resolveArtifact(projectPath, platform, stage, configuration) {
  const dir = stageOutputDir(projectPath, platform, stage, configuration);
  if (stage !== "package") return dir;
  if (platform === "web") {
    const archive = findFirst(dir, (name) => name.endsWith(".tar.gz") || name.endsWith(".zip"));
    if (archive) return archive;
  } else if (platform === "ios") {
    const ipa = findFirst(dir, (name) => name.endsWith(".ipa"));
    if (ipa) return ipa;
  } else if (platform === "android") {
    const aab = findFirst(dir, (name) => name.endsWith(".aab") || name.endsWith(".apk"));
    if (aab) return aab;
  }
  return dir;
}

function cliEntry() {
  return path.join(getCliDir(), "cli.js");
}

// Forward the editor's prebuilt engine binaries (and, when packaged, prebuilt WASM)
// so the spawned CLI never needs cargo / wasm-pack. Harmless when the CLI ignores them.
function prebuiltToolEnv() {
  const env = {};
  if (bundledToolsEnabled()) {
    const bundler = toolBinPath("blackbox-bundler");
    const lint = toolBinPath("blackbox-lint");
    if (bundler && existsSync(bundler)) env.BLACKBOX_BUNDLER_BIN = bundler;
    if (lint && existsSync(lint)) env.BLACKBOX_LINT_BIN = lint;
  }
  const toolsDir = getToolsDir();
  if (toolsDir) env.BLACKBOX_TOOLS_DIR = toolsDir;
  return env;
}

function cliSpawnOptions({ inheritStdio = false, extraEnv = {} } = {}) {
  return {
    cwd: getCliDir(),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", ...prebuiltToolEnv(), ...extraEnv },
    stdio: inheritStdio ? "inherit" : ["ignore", "pipe", "pipe"],
    ...(process.platform === "win32" ? { windowsHide: true } : {}),
  };
}

/**
 * Run the build CLI with arbitrary arguments. Resolves to the child exit code.
 * With `inheritStdio: true`, stdout/stderr are forwarded for CI / terminal use.
 */
export function runCli(cliArgs, { inheritStdio = false } = {}) {
  const args = [cliEntry(), ...cliArgs];

  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, cliSpawnOptions({ inheritStdio }));

    child.on("error", (error) => {
      if (inheritStdio) {
        console.error(`[editor] failed to launch CLI: ${error.message}`);
      }
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

/**
 * Spawn the build CLI for a single stage, streaming merged stdout/stderr lines to `onLine`.
 * Returns a handle whose `done` resolves to `{ exitCode, canceled, artifact }`.
 */
export function spawnStage(projectPath, { platform, configuration, stage, reactCompiler }, onLine) {
  const args = [
    cliEntry(),
    stage,
    `--project=${projectPath}`,
    `--platform=${platform}`,
    `--configuration=${configuration}`,
  ];

  // Forwarded to the web bundler (apps/web rolldown config) through the CLI's
  // playerBuildEnv, which spreads process.env. Set explicitly either way so the
  // build reflects the Build-tab checkbox regardless of any ambient env value.
  const extraEnv = {
    BLACKBOX_REACT_COMPILER: reactCompiler === false ? "false" : "true",
  };

  const child = spawn(process.execPath, args, cliSpawnOptions({ extraEnv }));

  let buffer = "";
  let canceled = false;
  const emit = (chunk) => {
    buffer += chunk.toString();
    let index = buffer.indexOf("\n");
    while (index !== -1) {
      onLine(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf("\n");
    }
  };
  child.stdout.on("data", emit);
  child.stderr.on("data", emit);

  const done = new Promise((resolve) => {
    const finish = (exitCode) => {
      if (buffer.length) {
        onLine(buffer);
        buffer = "";
      }
      resolve({
        exitCode,
        canceled,
        artifact:
          exitCode === 0 ? resolveArtifact(projectPath, platform, stage, configuration) : null,
      });
    };
    child.on("error", (error) => {
      onLine(`[build] failed to launch CLI: ${error.message}`);
      finish(-1);
    });
    child.on("close", (code) => finish(code ?? 1));
  });

  return {
    done,
    cancel() {
      canceled = true;
      child.kill("SIGTERM");
    },
  };
}
