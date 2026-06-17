import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { windowsSpawnOptions } from "../../lib/spawn.mjs";
import { resolvePlatformConfig } from "../../lib/adventure.mjs";
import { sharedBundleChecks } from "../../lib/preflight/bundleCommon.mjs";
import { requireStageReady } from "../../lib/preflight/index.mjs";
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

/** @typedef {import("../../lib/preflight/types.mjs").PreflightContext} PreflightContext */

export const preflight = {
  /** @param {PreflightContext} ctx */
  bundle: (ctx) => sharedBundleChecks(ctx),
  /** @param {PreflightContext} _ctx */
  build: async (_ctx) => [],
  /** @param {PreflightContext} _ctx */
  package: async (_ctx) => [],
};

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function copyTree(src, dest) {
  cpSync(src, dest, { recursive: true });
}

function writeManifest(dir, project, platformConfig) {
  writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      {
        platform: "web",
        gameId: project.gameId,
        title: project.title,
        revision: project.revision,
        appName: platformConfig.appName,
        builtAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
}

export function stageLint(project) {
  runLint(project);
  runScriptsLint();
  runWebLint();
}

export function stageBuild(project, { configuration = project.configuration ?? "release" } = {}) {
  runWebPlayerBuild(project, { configuration, platform: "web" });
  if (!existsSync(project.webWwwDir)) {
    fail("web", `missing build output at ${project.webWwwDir}`);
  }
  log("build", `ok -> ${displayPath(project.webWwwDir)}`);
}

export async function stageBundle(
  project,
  { configuration = project.configuration ?? "release", skipPreflight = false } = {},
) {
  if (!skipPreflight) {
    await requireStageReady("web", "bundle", project);
  }
  return runBundler(project, "web", { configuration });
}

export async function stagePackage(
  project,
  { noBuild = false, configuration = project.configuration ?? "release", skipPreflight = false } = {},
) {
  if (!skipPreflight) {
    await requireStageReady("web", "bundle", project);
  }

  const platformConfig = resolvePlatformConfig(project, "web");
  if (!noBuild) {
    stageBuild(project, { configuration });
  } else if (!existsSync(project.webWwwDir)) {
    fail(
      "web",
      `missing build output at ${project.webWwwDir} — run build first or drop --no-build`,
    );
  }
  const bundleOut = await stageBundle(project, { configuration, skipPreflight: true });

  const outDir = project.packageDir("web");
  const payloadDir = path.join(outDir, "payload");
  ensureDir(payloadDir);

  copyTree(project.webWwwDir, path.join(payloadDir, "www"));
  copyTree(bundleOut, path.join(payloadDir, "bundle"));
  writeManifest(outDir, project, platformConfig);

  const archiveBase = path.join(outDir, platformConfig.outputName);
  if (process.platform === "win32") {
    const zipPath = `${archiveBase}.zip`;
    exec("powershell", [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${payloadDir.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
    ]);
    log("package", `created ${displayPath(zipPath)}`);
    return zipPath;
  }

  const tarPath = `${archiveBase}.tar.gz`;
  exec("tar", ["-czf", tarPath, "-C", payloadDir, "."]);
  log("package", `created ${displayPath(tarPath)}`);
  return tarPath;
}

export function stageDeploy(
  project,
  { noBuild = false, configuration = project.configuration ?? "release" } = {},
) {
  if (configuration !== "release") {
    fail("web", "deploy requires --configuration=release");
  }
  if (!noBuild) {
    stageBuild(project, { configuration });
  } else if (!existsSync(project.webWwwDir)) {
    fail(
      "web",
      `missing build output at ${project.webWwwDir} — run build first or drop --no-build`,
    );
  }

  log("deploy", `vercel production deploy from ${displayPath(project.webWwwDir)}`);
  deployWwwToVercel(project.webWwwDir, {
    templatePath: path.join(WEB_ROOT, "vercel.json"),
  });
}

/** Serve the built www/ with apps/web/server.js (blocks until the process exits). */
export function spawnWebServer(
  project,
  { configuration = project.configuration ?? "release" } = {},
) {
  const wwwDir = project.webWwwDir;
  if (!existsSync(path.join(wwwDir, "index.html"))) {
    fail(
      "web",
      `nothing to serve at ${displayPath(wwwDir)} — run \`node cli.js build\` first`,
    );
  }

  const port = process.env.PORT ?? "8080";
  log(
    "server",
    `starting http://localhost:${port} (${configuration}) -> ${displayPath(wwwDir)}`,
  );

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(WEB_ROOT, "server.js")], {
      cwd: WEB_ROOT,
      env: playerBuildEnv(project, configuration),
      stdio: "inherit",
      ...windowsSpawnOptions(),
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`web server exited with code ${code ?? 1}`));
    });
  });
}
