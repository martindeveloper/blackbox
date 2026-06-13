import { tryAssetUrl } from "./engine.js";
import { getLogLevel, logger } from "./logger.js";
import { getWebPlayerOptions } from "./playerConfig.js";

export type AssetKind = "texture" | "music" | "sfx";

type AssetStatus = "loading" | "ready" | "error";

interface ManagedAsset {
  kind: AssetKind;
  src: string;
  key: string;
  url: string;
  refCount: number;
  scopes: Set<string>;
  status: AssetStatus;
  image?: HTMLImageElement;
  error?: string;
}

interface ScopeBinding {
  key: string;
  kind: AssetKind;
  src: string;
}

interface AssetRecord {
  kind: AssetKind;
  src: string;
  refCount: number;
  status: AssetStatus;
  scopes: string[];
  inUse: boolean;
}

type AssetListener = () => void;
type SfxReleaseHandler = (src: string) => void;

function assetKey(kind: AssetKind, src: string): string {
  return `${kind}:${src}`;
}

function textureFallbackSrc(src: string): string | undefined {
  const { fallbackPortrait, fallbackBackground } = getWebPlayerOptions().assets;
  if (src === fallbackPortrait || src === fallbackBackground) {
    return undefined;
  }
  if (src.startsWith("textures/characters/")) {
    return fallbackPortrait;
  }
  if (src.startsWith("textures/backgrounds/")) {
    return fallbackBackground;
  }
  return undefined;
}

function resolveTextureUrl(
  src: string,
  scope: string,
): { url: string; status: AssetStatus; usingFallback: boolean } | null {
  const resolved = tryAssetUrl(src);
  if (resolved) {
    return { url: resolved, status: "loading", usingFallback: false };
  }

  logger.error("assets", "Texture missing from bundle", { src, scope });

  const fallbackSrc = textureFallbackSrc(src);
  if (!fallbackSrc) {
    return null;
  }

  const fallbackUrl = tryAssetUrl(fallbackSrc);
  if (!fallbackUrl) {
    logger.error("assets", "Texture fallback missing from bundle", {
      src,
      fallback: fallbackSrc,
      scope,
    });
    return null;
  }

  logger.debug("assets", "Using texture fallback", { src, fallback: fallbackSrc, scope });
  return { url: fallbackUrl, status: "loading", usingFallback: true };
}

class AssetManager {
  private readonly assets = new Map<string, ManagedAsset>();
  private readonly scopes = new Map<string, ScopeBinding>();
  private readonly scopeListeners = new Map<string, Set<AssetListener>>();
  private readonly ephemeralTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private sfxReleaseHandler: SfxReleaseHandler | null = null;

  registerSfxReleaseHandler(handler: SfxReleaseHandler): void {
    this.sfxReleaseHandler = handler;
    logger.debug("assets", "SFX release handler registered");
  }

  subscribe(scope: string, listener: AssetListener): () => void {
    let listeners = this.scopeListeners.get(scope);
    if (!listeners) {
      listeners = new Set();
      this.scopeListeners.set(scope, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners!.delete(listener);
      if (listeners!.size === 0) {
        this.scopeListeners.delete(scope);
      }
    };
  }

  setScope(scope: string, kind: AssetKind, src: string | undefined): void {
    const current = this.scopes.get(scope);

    if (current && current.kind === kind && current.src === src) {
      return;
    }

    if (current) {
      logger.debug("assets", `Scope '${scope}' changing`, {
        from: current.src,
        to: src ?? null,
        kind,
      });
      this.releaseBinding(scope, current);
      this.scopes.delete(scope);
    } else if (src) {
      logger.debug("assets", `Scope '${scope}' acquiring`, { src, kind });
    }

    if (!src) {
      this.notifyScope(scope);
      return;
    }

    const key = assetKey(kind, src);
    this.acquire(key, kind, src, scope);
    this.scopes.set(scope, { key, kind, src });
    this.notifyScope(scope);
  }

  clearScope(scope: string): void {
    const current = this.scopes.get(scope);
    if (!current) return;

    for (const [timerKey, timer] of this.ephemeralTimers) {
      if (timerKey.startsWith(`${scope}:`)) {
        clearTimeout(timer);
        this.ephemeralTimers.delete(timerKey);
      }
    }

    logger.debug("assets", `Scope '${scope}' cleared`, { src: current.src, kind: current.kind });
    this.releaseBinding(scope, current);
    this.scopes.delete(scope);
    this.notifyScope(scope);
  }

  getScopeUrl(scope: string): string | undefined {
    const binding = this.scopes.get(scope);
    if (!binding) return undefined;
    return this.assets.get(binding.key)?.url;
  }

  getScopeStatus(scope: string): AssetStatus | undefined {
    const binding = this.scopes.get(scope);
    if (!binding) return undefined;
    return this.assets.get(binding.key)?.status;
  }

  touchEphemeral(scope: string, kind: AssetKind, src: string, ttlMs: number): void {
    const timerKey = `${scope}:${kind}`;
    const existing = this.ephemeralTimers.get(timerKey);
    if (existing) clearTimeout(existing);

    this.setScope(scope, kind, src);

    const timer = setTimeout(() => {
      this.ephemeralTimers.delete(timerKey);
      logger.debug("assets", `Ephemeral TTL expired for scope '${scope}'`, { src, kind, ttlMs });
      this.clearScope(scope);
    }, ttlMs);

    this.ephemeralTimers.set(timerKey, timer);
  }

  private list(): AssetRecord[] {
    return Array.from(this.assets.values()).map((asset) => ({
      kind: asset.kind,
      src: asset.src,
      refCount: asset.refCount,
      status: asset.status,
      scopes: Array.from(asset.scopes),
      inUse: asset.refCount > 0,
    }));
  }

  private acquire(key: string, kind: AssetKind, src: string, scope: string): void {
    let asset = this.assets.get(key);

    if (!asset) {
      let resolvedUrl = "";
      let usingFallback = false;
      let initialStatus: AssetStatus = kind === "texture" ? "loading" : "ready";
      if (kind === "texture") {
        const resolved = resolveTextureUrl(src, scope);
        if (resolved) {
          resolvedUrl = resolved.url;
          usingFallback = resolved.usingFallback;
          initialStatus = resolved.status;
        } else {
          initialStatus = "error";
        }
      }
      asset = {
        kind,
        src,
        key,
        url: resolvedUrl,
        refCount: 0,
        scopes: new Set(),
        status: initialStatus,
      };
      this.assets.set(key, asset);
      logger.debug("assets", `Acquired ${kind}`, { src, scope });

      if (kind === "texture" && resolvedUrl) {
        this.preloadTexture(asset, resolvedUrl, usingFallback);
      }
    } else {
      logger.debug("assets", `Re-acquired ${kind}`, { src, scope, refCount: asset.refCount + 1 });
    }

    asset.scopes.add(scope);
    asset.refCount += 1;
    this.logInventory("after acquire");
  }

  private releaseBinding(scope: string, binding: ScopeBinding): void {
    const asset = this.assets.get(binding.key);
    if (!asset) return;

    asset.scopes.delete(scope);
    this.dropRef(asset, scope);
  }

  private dropRef(asset: ManagedAsset, reason: string): void {
    asset.refCount = Math.max(0, asset.refCount - 1);

    logger.debug("assets", `Released ${asset.kind}`, {
      src: asset.src,
      reason,
      refCount: asset.refCount,
      scopes: Array.from(asset.scopes),
    });

    if (asset.refCount > 0) {
      this.logInventory("after release");
      return;
    }

    this.dispose(asset);
    this.logInventory("after dispose");
  }

  private dispose(asset: ManagedAsset): void {
    logger.debug("assets", `Disposed ${asset.kind}`, {
      src: asset.src,
      status: asset.status,
    });

    if (asset.kind === "texture" && asset.image) {
      asset.image.onload = null;
      asset.image.onerror = null;
      asset.image.src = "";
      asset.image = undefined;
    }

    if (asset.kind === "sfx") {
      this.sfxReleaseHandler?.(asset.src);
    }

    this.assets.delete(asset.key);
  }

  private preloadTexture(asset: ManagedAsset, url = asset.url, usingFallback = false): void {
    if (!url) {
      asset.status = "error";
      asset.error = "Image URL missing";
      this.notifyScopesForAsset(asset.key);
      return;
    }

    const img = new Image();

    img.onload = () => {
      if (!this.assets.has(asset.key)) return;
      asset.image = img;
      asset.url = url;
      asset.status = "ready";
      logger.debug("assets", usingFallback ? "Texture fallback ready" : "Texture ready", {
        src: asset.src,
        url,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      this.notifyScopesForAsset(asset.key);
    };

    img.onerror = () => {
      if (!this.assets.has(asset.key)) return;

      if (usingFallback) {
        asset.status = "error";
        asset.error = "Fallback image load failed";
        logger.error("assets", "Texture fallback failed to load", {
          src: asset.src,
          url,
          fallback: textureFallbackSrc(asset.src),
        });
        this.notifyScopesForAsset(asset.key);
        return;
      }

      logger.error("assets", "Texture failed to load", { src: asset.src, url });

      const fallbackSrc = textureFallbackSrc(asset.src);
      if (fallbackSrc) {
        const fallbackUrl = tryAssetUrl(fallbackSrc);
        if (fallbackUrl) {
          logger.debug("assets", "Trying texture fallback", {
            src: asset.src,
            fallback: fallbackSrc,
          });
          this.preloadTexture(asset, fallbackUrl, true);
          return;
        }
        logger.error("assets", "Texture fallback missing from bundle", {
          src: asset.src,
          fallback: fallbackSrc,
        });
      }

      asset.status = "error";
      asset.error = "Image load failed";
      this.notifyScopesForAsset(asset.key);
    };

    logger.debug("assets", usingFallback ? "Texture fallback loading" : "Texture loading", {
      src: asset.src,
      url,
    });
    img.src = url;
  }

  private logInventory(context: string): void {
    if (getLogLevel() !== "debug") return;
    const inventory = this.list();
    logger.debug("assets", `Inventory (${context})`, {
      total: inventory.length,
      inUse: inventory.filter((entry) => entry.inUse).length,
      assets: inventory,
    });
  }

  private notifyScope(scope: string): void {
    const listeners = this.scopeListeners.get(scope);
    if (!listeners) return;
    for (const listener of listeners) {
      listener();
    }
  }

  private notifyScopesForAsset(assetKey: string): void {
    for (const [scope, binding] of this.scopes) {
      if (binding.key === assetKey) {
        this.notifyScope(scope);
      }
    }
  }
}

export const assetManager = new AssetManager();
