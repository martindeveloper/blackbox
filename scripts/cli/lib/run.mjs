import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wasmProfileForConfiguration } from "../../lib/adventure.mjs";
import { runSync } from "../../lib/spawn.mjs";
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

export function runLint(project) {
  log("lint", `validating ${path.relative(REPO_ROOT, project.scenarioPath)}`);
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
  const args = [
    "run",
    "-p",
    "blackbox-bundler",
    "--release",
    "--",
    project.scenarioPath,
    "--platform",
    platform,
    "-o",
    outDir,
    "--cache-dir",
    path.join(REPO_ROOT, ".cache/bundle"),
  ];
  if (ignoreMissing) args.push("--ignore-missing");
  if (compress && compress !== "none") {
    args.push("--archive-compress", compress);
  }
  runSync("cargo", args, { cwd: REPO_ROOT });
  return outDir;
}

export function runWebPlayerBuild(
  project,
  { configuration = project.configuration ?? "release", platform = "web" } = {},
) {
  log("build", `compiling web player for ${project.gameId} (${configuration}, ${platform})`);
  runSync("npm", ["run", "build", "--prefix", WEB_ROOT], {
    cwd: REPO_ROOT,
    env: {
      ...playerBuildEnv(project, configuration, platform),
      PROFILE: wasmProfileForConfiguration(configuration),
    },
  });
}

export function runScriptsLint() {
  log("lint", "running build scripts linter");
  runSync("npm", ["run", "lint", "--prefix", SCRIPTS_ROOT], { cwd: REPO_ROOT });
}

export function runWebLint() {
  log("lint", "running web player linter");
  runSync("npm", ["run", "lint", "--prefix", WEB_ROOT], { cwd: REPO_ROOT });
}

export function exec(command, args, { cwd = REPO_ROOT, env = process.env } = {}) {
  execFileSync(command, args, {
    stdio: "inherit",
    cwd,
    env,
    shell: process.platform === "win32",
  });
}
