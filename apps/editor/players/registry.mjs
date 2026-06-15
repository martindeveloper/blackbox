import path from "node:path";
import { pathToFileURL } from "node:url";
import { manifest as webManifest, PLAYER_ID as WEB_PLAYER_ID } from "./web/manifest.mjs";
import { configureWebRuntime } from "./web/runtime.mjs";
import { ensurePreviewBuilt } from "./web/previewBuild.mjs";
import { ensureWebProjectIdeSetup } from "./web/scaffold.mjs";
import { syncBuildAssets } from "./web/syncAssets.mjs";
import { stageForPackaging } from "./web/stage.mjs";

export const DEFAULT_CODE_PLAYER_ID = WEB_PLAYER_ID;

const webPlayer = {
  manifest: webManifest,
  configureRuntime: configureWebRuntime,
  ensurePreviewBuilt,
  ensureProjectIdeSetup: ensureWebProjectIdeSetup,
  syncBuildAssets,
  stageForPackaging,
};

const PLAYERS = {
  [WEB_PLAYER_ID]: webPlayer,
};

export function listPlayers() {
  return Object.values(PLAYERS).map((player) => player.manifest);
}

export function getPlayer(id) {
  return PLAYERS[id] ?? null;
}

export function playersWith(capability) {
  return Object.values(PLAYERS).filter((player) => player.manifest.capabilities[capability]);
}

export function configurePlayerRuntimes({ usePackagedResources, clientRoot, resourcesPath, env }) {
  for (const player of Object.values(PLAYERS)) {
    player.configureRuntime?.({ usePackagedResources, clientRoot, resourcesPath, env });
  }
}

export async function runSyncBuildAssets() {
  for (const player of Object.values(PLAYERS)) {
    if (player.syncBuildAssets) await player.syncBuildAssets();
  }
}

export async function runStageForPackaging() {
  for (const player of Object.values(PLAYERS)) {
    if (player.stageForPackaging) await player.stageForPackaging();
  }
}

export async function ensurePlayerProjectIdeSetup(playerId, projectPath, sdkRootOverride) {
  const player = getPlayer(playerId);
  if (!player?.manifest.capabilities.projectScaffold || !player.ensureProjectIdeSetup) {
    return false;
  }
  return player.ensureProjectIdeSetup(projectPath, sdkRootOverride);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const hook = process.argv[2];
  if (hook === "syncBuildAssets") {
    await runSyncBuildAssets();
  } else if (hook === "stageForPackaging") {
    await runStageForPackaging();
  } else {
    console.error("Usage: node ./players/registry.mjs <syncBuildAssets|stageForPackaging>");
    process.exit(1);
  }
}
