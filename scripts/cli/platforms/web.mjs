import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolvePlatformConfig } from "../../lib/adventure.mjs";
import { deployWwwToVercel } from "../../lib/vercelDeploy.mjs";
import { exec, fail, log, REPO_ROOT, runBundler, runLint, runWebLint, runWebPlayerBuild, WEB_ROOT } from "../lib/run.mjs";

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
  runWebLint();
}

export function stageBuild(project, { configuration = project.configuration ?? "release" } = {}) {
  runWebPlayerBuild(project, { configuration });
  if (!existsSync(project.webWwwDir)) {
    fail("web", `missing build output at ${project.webWwwDir}`);
  }
  log("build", `ok -> ${path.relative(REPO_ROOT, project.webWwwDir)}`);
}

export function stageBundle(project, { configuration = project.configuration ?? "release" } = {}) {
  return runBundler(project, "web", { configuration });
}

export function stagePackage(project, { noBuild = false, configuration = project.configuration ?? "release" } = {}) {
  const platformConfig = resolvePlatformConfig(project, "web");
  if (!noBuild) {
    stageBuild(project, { configuration });
  } else if (!existsSync(project.webWwwDir)) {
    fail("web", `missing build output at ${project.webWwwDir} — run build first or drop --no-build`);
  }
  const bundleOut = stageBundle(project, { configuration });

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
    log("package", `created ${path.relative(REPO_ROOT, zipPath)}`);
    return zipPath;
  }

  const tarPath = `${archiveBase}.tar.gz`;
  exec("tar", ["-czf", tarPath, "-C", payloadDir, "."]);
  log("package", `created ${path.relative(REPO_ROOT, tarPath)}`);
  return tarPath;
}

export function stageDeploy(project, { noBuild = false, configuration = project.configuration ?? "release" } = {}) {
  if (configuration !== "release") {
    fail("web", "deploy requires --configuration=release");
  }
  if (!noBuild) {
    stageBuild(project, { configuration });
  } else if (!existsSync(project.webWwwDir)) {
    fail("web", `missing build output at ${project.webWwwDir} — run build first or drop --no-build`);
  }

  log("deploy", `vercel production deploy from ${path.relative(REPO_ROOT, project.webWwwDir)}`);
  deployWwwToVercel(project.webWwwDir, {
    templatePath: path.join(WEB_ROOT, "vercel.json"),
  });
}
