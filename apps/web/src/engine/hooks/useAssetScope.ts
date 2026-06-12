import { useEffect, useState } from "react";
import { assetManager, type AssetKind } from "../lib/assetManager.js";
import type { CharacterView } from "../types/game.js";

export interface ManagedAssetView {
  url: string | undefined;
  status: "loading" | "ready" | "error" | undefined;
}

export function isManagedAssetReady(asset: ManagedAssetView): boolean {
  return Boolean(asset.url && asset.status !== "error");
}

export interface ManagedTexture {
  ready: boolean;
  url: string | undefined;
}

export function useManagedTexture(scope: string, src: string | undefined): ManagedTexture {
  const asset = useAssetScope(scope, "texture", src);
  const ready = isManagedAssetReady(asset);

  return {
    ready,
    url: ready ? asset.url : undefined,
  };
}

export function useCharacterPortrait(character: CharacterView | undefined) {
  const scope = character
    ? `character:portrait:${character.ref_id}`
    : "character:portrait:__none__";
  const texture = useManagedTexture(scope, character?.portrait?.src);
  const hasPortrait = Boolean(character?.portrait);

  return {
    hasPortrait,
    ready: texture.ready,
    url: texture.url,
    showHeaderName: !hasPortrait || texture.ready,
  };
}

export function useAssetScope(
  scope: string,
  kind: AssetKind,
  src: string | undefined,
): ManagedAssetView {
  const [, bump] = useState(0);

  useEffect(() => assetManager.subscribe(scope, () => bump((n) => n + 1)), [scope]);

  useEffect(() => {
    assetManager.setScope(scope, kind, src);
    return () => assetManager.clearScope(scope);
  }, [scope, kind, src]);

  return {
    url: assetManager.getScopeUrl(scope),
    status: assetManager.getScopeStatus(scope),
  };
}
