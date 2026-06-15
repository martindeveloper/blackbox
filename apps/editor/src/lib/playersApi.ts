import { Api } from "./api.js";

export interface PlayerCapabilities {
  livePreview: boolean;
  bundle: boolean;
  projectScaffold: boolean;
}

export interface PlayerManifest {
  id: string;
  label: string;
  capabilities: PlayerCapabilities;
}

export async function listPlayers(): Promise<PlayerManifest[]> {
  const response = await fetch(Api.Players);
  const data = (await response.json()) as { players: PlayerManifest[] };
  if (!response.ok) throw new Error(`Failed to list players: HTTP ${response.status}`);
  return data.players;
}

export function pickBundlePlayer(players: PlayerManifest[]): PlayerManifest {
  const player = players.find((entry) => entry.capabilities.bundle);
  if (!player) {
    throw new Error("No bundle-capable player is registered (see GET /api/v1/players)");
  }
  return player;
}

export async function getDefaultBundlePlayerId(): Promise<string> {
  return pickBundlePlayer(await listPlayers()).id;
}
