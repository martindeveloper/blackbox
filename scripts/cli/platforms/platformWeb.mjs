import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolvePlatformConfig } from "../../lib/adventure.mjs";
import { windowsSpawnOptions } from "../../lib/spawn.mjs";
import { deployWwwToVercel } from "../../lib/vercelDeploy.mjs";
import { playerBuildEnv } from "../lib/buildEnv.mjs";
import {
  displayPath,
  exec,
  fail,
  log,
  runBundler,
  runLint,
  runScriptsLint,
  runWebLint,
  runWebPlayerBuild,
  WEB_ROOT,
} from "../lib/run.mjs";

export const name = "web";

export function preflightCheck() {
  return [];
}

export function executeLint({ project }) {
  runLint(project);
  runScriptsLint();
  runWebLint();
}

export function executeBundle({ project, options }) {
  return runBundler(project, name, { configuration: options.configuration });
}

export function executeBuild({ project, options }) {
  runWebPlayerBuild(project, {
    configuration: options.configuration,
    platform: name,
    bundleInput: options.bundleInput,
  });
  return project.webWwwDir;
}

export function afterBuild({ project, artifact }) {
  if (!existsSync(project.webWwwDir)) {
    fail(name, `missing build output at ${project.webWwwDir}`);
  }
  log("build", `ok -> ${displayPath(artifact)}`);
}

export function executePackage({ project, options }) {
  if (!existsSync(options.buildInput)) {
    fail(name, `missing build input at ${options.buildInput}`);
  }
  if (!existsSync(options.bundleInput)) {
    fail(name, `missing bundle input at ${options.bundleInput}`);
  }

  const config = resolvePlatformConfig(project, name);
  const outDir = project.packageDir(name);
  const payloadDir = path.join(outDir, "payload");
  mkdirSync(payloadDir, { recursive: true });
  cpSync(options.buildInput, path.join(payloadDir, "www"), { recursive: true });
  cpSync(options.bundleInput, path.join(payloadDir, "bundle"), { recursive: true });
  writeFileSync(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify(
      {
        platform: name,
        gameId: project.gameId,
        title: project.title,
        revision: project.revision,
        appName: config.appName,
        builtAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );

  const archiveBase = path.join(outDir, config.outputName);
  if (process.platform === "win32") {
    const zipPath = `${archiveBase}.zip`;
    exec("powershell", [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${payloadDir.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
    ]);
    return zipPath;
  }
  const tarPath = `${archiveBase}.tar.gz`;
  exec("tar", ["-czf", tarPath, "-C", payloadDir, "."]);
  return tarPath;
}

export function deploy(project, { noBuild = false, configuration = "release" } = {}) {
  if (configuration !== "release") fail(name, "deploy requires --configuration=release");
  if (!noBuild && !existsSync(project.webWwwDir)) {
    fail(name, `missing build output at ${project.webWwwDir}`);
  }
  deployWwwToVercel(project.webWwwDir, { templatePath: path.join(WEB_ROOT, "vercel.json") });
}

export function spawnServer(project, { configuration = "release" } = {}) {
  if (!existsSync(path.join(project.webWwwDir, "index.html"))) {
    fail(name, `nothing to serve at ${displayPath(project.webWwwDir)}`);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(WEB_ROOT, "server.js")], {
      cwd: WEB_ROOT,
      env: playerBuildEnv(project, configuration),
      stdio: "inherit",
      ...windowsSpawnOptions(),
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 || code === null
        ? resolve()
        : reject(new Error(`web server exited with code ${code ?? 1}`)),
    );
  });
}
