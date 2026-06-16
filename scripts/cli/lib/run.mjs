import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wasmProfileForConfiguration } from "../../lib/adventure.mjs";
import { needsShell, runSync, windowsSpawnOptions } from "../../lib/spawn.mjs";
import { playerBuildEnv } from "./buildEnv.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
export const SCRIPTS_ROOT = path.join(REPO_ROOT, "scripts");
export const WEB_ROOT = path.join(REPO_ROOT, "apps", "web");
export const MOBILE_ROOT = path.join(REPO_ROOT, "apps", "mobile");

export function log(scope, msg) {
  console.log(`[${scope}] ${msg}`);
}

export function fail(scope, msg) {
  console.error(`[${scope}] ${msg}`);
  process.exit(1);
}

// A self-contained editor forwards prebuilt engine binaries via env so stages need no cargo.
function prebuiltBin(name) {
  const bin = process.env[name];
  return bin && existsSync(bin) ? bin : null;
}

// Bundler scratch cache. A packaged editor redirects this to a writable user-data dir
// because the repo root lives under read-only application resources.
function bundleCacheDir() {
  const base = process.env.BLACKBOX_BUILD_CACHE_DIR ?? path.join(REPO_ROOT, ".cache");
  return path.join(base, "bundle");
}

export function runLint(project) {
  log("lint", `validating ${path.relative(REPO_ROOT, project.scenarioPath)}`);
  const lintBin = prebuiltBin("BLACKBOX_LINT_BIN");
  if (lintBin) {
    runSync(lintBin, [project.scenarioPath], { cwd: REPO_ROOT });
    return;
  }
  runSync("cargo", ["run", "-p", "blackbox-lint", "--release", "--", project.scenarioPath], {
    cwd: REPO_ROOT,
  });
}

export function runBundler(
  project,
  platform,
  {
    configuration = project.configuration ?? "release",
    ignoreMissing = true,
    archiveCompress,
  } = {},
) {
  const outDir = project.bundleDir(platform);
  const compress = archiveCompress ?? (configuration === "debug" ? "none" : "zstd");
  log(
    "bundle",
    `building ${platform} content bundle (${configuration}) -> ${path.relative(REPO_ROOT, outDir)}`,
  );
  const bundlerArgs = [
    project.scenarioPath,
    "--platform",
    platform,
    "-o",
    outDir,
    "--cache-dir",
    bundleCacheDir(),
  ];
  if (ignoreMissing) bundlerArgs.push("--ignore-missing");
  if (compress && compress !== "none") {
    bundlerArgs.push("--archive-compress", compress);
  }
  const bundlerBin = prebuiltBin("BLACKBOX_BUNDLER_BIN");
  if (bundlerBin) {
    runSync(bundlerBin, bundlerArgs, { cwd: REPO_ROOT });
  } else {
    runSync("cargo", ["run", "-p", "blackbox-bundler", "--release", "--", ...bundlerArgs], {
      cwd: REPO_ROOT,
    });
  }
  return outDir;
}

export function runWebPlayerBuild(
  project,
  { configuration = project.configuration ?? "release", platform = "web" } = {},
) {
  log("build", `compiling web player for ${project.gameId} (${configuration}, ${platform})`);
  runSync("npm", ["run", "build"], {
    cwd: WEB_ROOT,
    env: {
      ...playerBuildEnv(project, configuration, platform),
      PROFILE: wasmProfileForConfiguration(configuration),
    },
  });
}

export function runScriptsLint() {
  log("lint", "running build scripts linter");
  runSync("npm", ["run", "lint"], { cwd: SCRIPTS_ROOT });
}

export function runWebLint() {
  log("lint", "running web player linter");
  runSync("npm", ["run", "lint"], { cwd: WEB_ROOT });
}

export function exec(command, args, { cwd = REPO_ROOT, env = process.env } = {}) {
  execFileSync(command, args, {
    stdio: "inherit",
    cwd,
    env,
    shell: needsShell(command),
    ...windowsSpawnOptions(),
  });
}
