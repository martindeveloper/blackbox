import type { GameView } from "../types/game.js";
import { diagnostics, hasAsset } from "@content-source";
import { tryAssetUrl } from "./engine.js";
import { getLogLevel, logger } from "./logger.js";

function assetStatus(src: string | undefined): {
  src: string | null;
  inBundle: boolean;
  blobUrl: boolean;
} {
  if (!src) {
    return { src: null, inBundle: false, blobUrl: false };
  }
  return {
    src,
    inBundle: hasAsset(src),
    blobUrl: tryAssetUrl(src) !== null,
  };
}

function textKindCounts(view: GameView): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const block of view.text) {
    counts[block.kind] = (counts[block.kind] ?? 0) + 1;
  }
  return counts;
}

function missingAssetPaths(view: GameView): string[] {
  const missing: string[] = [];
  if (view.background?.src && !hasAsset(view.background.src)) {
    missing.push(view.background.src);
  }
  for (const character of view.characters) {
    const src = character.portrait?.src;
    if (src && !hasAsset(src)) {
      missing.push(src);
    }
  }
  if (view.music?.src && !hasAsset(view.music.src)) {
    missing.push(view.music.src);
  }
  return missing;
}

export function logViewDiagnostics(view: GameView, context?: string): void {
  const label = context ? ` (${context})` : "";
  const missingAssets = missingAssetPaths(view);
  if (missingAssets.length > 0) {
    logger.warn("view", `Bundle missing assets${label}`, { paths: missingAssets });
  }

  if (getLogLevel() !== "debug") return;

  logger.debug("view", `Diagnostics${label}`, {
    node: view.node_id,
    chapter: view.chapter_id ?? null,
    mode: view.mode,
    textBlockCount: view.text.length,
    textKinds: textKindCounts(view),
    flags: view.flags,
    characters: view.characters.map((character) => ({
      ref: character.ref_id,
      name: character.name,
      portrait: assetStatus(character.portrait?.src),
    })),
    relationships: (view.relationships ?? []).map((character) => ({
      ref: character.ref_id,
      name: character.name,
      metrics: character.metrics,
    })),
    background: assetStatus(view.background?.src),
    music: assetStatus(view.music?.src),
    bundle: diagnostics(),
    textBlocks: view.text.map((block, index) => ({
      index,
      kind: block.kind,
      speaker: block.speaker ?? null,
      side: block.side ?? null,
      preview: block.text.slice(0, 120),
    })),
  });
}
