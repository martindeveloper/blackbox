// @engine/sdk/v1/hooks/assets - managed-asset hooks (Blackbox engine API v1).
import type { CharacterView } from "../types.js";
import {
  useManagedTexture as useManagedTextureInternal,
  useCharacterPortrait as useCharacterPortraitInternal,
  useAssetScope as useAssetScopeInternal,
} from "@engine/hooks/useAssetScope.js";
import type {
  ManagedTexture as ManagedTextureInternal,
  ManagedAssetView as ManagedAssetViewInternal,
} from "@engine/hooks/useAssetScope.js";
import type { AssetKind as AssetKindInternal } from "@engine/lib/assetManager.js";

export type ManagedTexture = ManagedTextureInternal;
export type ManagedAssetView = ManagedAssetViewInternal;
export type AssetKind = AssetKindInternal;

export function useManagedTexture(scope: string, src: string | undefined): ManagedTexture {
  return useManagedTextureInternal(scope, src);
}

export function useCharacterPortrait(
  character: CharacterView | undefined,
): ReturnType<typeof useCharacterPortraitInternal> {
  return useCharacterPortraitInternal(character);
}

export function useAssetScope(
  scope: string,
  kind: AssetKind,
  src: string | undefined,
): ManagedAssetView {
  return useAssetScopeInternal(scope, kind, src);
}
