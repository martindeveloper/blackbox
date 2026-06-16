import { useCallback, useEffect, useSyncExternalStore } from "react";
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
  useEffect(() => {
    assetManager.setScope(scope, kind, src);
    return () => assetManager.clearScope(scope);
  }, [scope, kind, src]);

  // assetManager is an external mutable store: subscribe via useSyncExternalStore so
  // the latest url/status is read on every notification. A plain render-time read
  // here would be a Rules-of-React violation that the React Compiler caches stale.
  const subscribe = useCallback(
    (onStoreChange: () => void) => assetManager.subscribe(scope, onStoreChange),
    [scope],
  );
  const url = useSyncExternalStore(subscribe, () => assetManager.getScopeUrl(scope));
  const status = useSyncExternalStore(subscribe, () => assetManager.getScopeStatus(scope));

  return { url, status };
}
