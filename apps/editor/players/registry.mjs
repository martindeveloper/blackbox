import * as web from "./web/manifest.mjs";
import { ensurePreviewBuilt } from "./web/previewBuild.mjs";

const PLAYERS = {
  [web.PLAYER_ID]: {
    manifest: web.manifest,
    resolveWorkspaceRoot: web.resolveWorkspaceRoot,
    ensurePreviewBuilt,
  },
};

export function listPlayers() {
  return Object.values(PLAYERS).map((player) => player.manifest);
}

export function getPlayer(id) {
  return PLAYERS[id] ?? null;
}

/** Player that supports live in-editor preview (web only for now). */
export function getPreviewPlayer() {
  return PLAYERS.web;
}
