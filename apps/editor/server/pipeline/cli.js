import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
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
 * incremental output the stages wrote there). Returns the root directory that was cleaned and
 * the immediate child folders that existed inside it (collected before deletion so the build
 * log can report exactly what was removed).
 */
export async function cleanBuildOutput(projectPath, configuration) {
  const dir = buildDir(projectPath, configuration);
  // The top-level listing is tiny (bundle/web/package), so a sync stat is fine; the heavy part
  // is the recursive delete, which runs async so it never blocks the server's event loop.
  const removed = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
  await rm(dir, { recursive: true, force: true });
  return { dir, removed };
}

/**
 * Project-scoped build scratch cache. The spawned build CLI reads BLACKBOX_BUILD_CACHE_DIR for its
 * bundler transcode cache (scripts/cli/lib/run.mjs, apps/web build-bundle) and tailwind wrapper
 * cache (apps/web build-game-css). Anchoring it inside the project's `.blackbox` keeps each
 * project's reusable caches independent, so a clean build of one never re-transcodes another.
 *
 * The engine WASM glue and cargo target are deliberately not project caches: for packaged users
 * the WASM is read-only prebuilt and there is no cargo at all, so neither is touched by a clean.
 */
export function buildCacheDir(projectPath) {
  return path.join(projectPath, ".blackbox", "cache");
}

/**
 * Ensure the project's build cache dir exists and is self-ignoring, so the (potentially large)
 * transcode/tailwind scratch is never committed even if the project's root .gitignore doesn't
 * know about it. Mirrors the build dir's self-ignore convention.
 */
export function ensureBuildCacheDir(projectPath) {
  const dir = buildCacheDir(projectPath);
  mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "*\n");
  return dir;
}

/**
 * Remove the project's reusable build cache so the next build regenerates it from scratch. Returns
 * the directory if it existed and was removed (for the build log), else null.
 */
export async function cleanBuildCaches(projectPath) {
  const dir = buildCacheDir(projectPath);
  const existed = existsSync(dir);
  await rm(dir, { recursive: true, force: true });
  return existed ? dir : null;
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
export function spawnStage(
  projectPath,
  { platform, configuration, stage, reactCompiler, bundleInput = null, buildInput = null },
  onLine,
) {
  const args = [
    cliEntry(),
    stage,
    `--project=${projectPath}`,
    `--platform=${platform}`,
    `--configuration=${configuration}`,
  ];

  if ((stage === "build" || stage === "package") && bundleInput) {
    args.push(`--bundle-input=${bundleInput}`);
  }
  if (stage === "package" && buildInput) {
    args.push(`--build-input=${buildInput}`);
  }

  // Forwarded to the web bundler (apps/web rolldown config) through the CLI's
  // playerBuildEnv, which spreads process.env. Set explicitly either way so the
  // build reflects the Build-tab checkbox regardless of any ambient env value.
  const extraEnv = {
    BLACKBOX_REACT_COMPILER: reactCompiler === false ? "false" : "true",
    // Project-scoped build scratch cache (bundler transcode + tailwind), so a clean build of one
    // project never invalidates another's cache. The project folder is always writable — unlike
    // the read-only app resources that originally forced this cache into shared user-data.
    BLACKBOX_BUILD_CACHE_DIR: ensureBuildCacheDir(projectPath),
  };

  const child = spawn(process.execPath, args, cliSpawnOptions({ extraEnv }));

  let buffer = "";
  let canceled = false;
  let artifact = null;
  const consumeLine = (line) => {
    const prefix = "::blackbox-artifact::";
    if (line.startsWith(prefix)) {
      try {
        artifact = JSON.parse(line.slice(prefix.length));
      } catch {
        onLine("[build] CLI returned an invalid artifact record");
      }
      return;
    }
    onLine(line);
  };
  const emit = (chunk) => {
    buffer += chunk.toString();
    let index = buffer.indexOf("\n");
    while (index !== -1) {
      consumeLine(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf("\n");
    }
  };
  child.stdout.on("data", emit);
  child.stderr.on("data", emit);

  const done = new Promise((resolve) => {
    const finish = (exitCode) => {
      if (buffer.length) {
        consumeLine(buffer);
        buffer = "";
      }
      resolve({
        exitCode,
        canceled,
        artifact: exitCode === 0 ? artifact : null,
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
