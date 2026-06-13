import type { TextGameComponentOverrides } from "../ui/textGame/types.js";
import { notifyStorageChanged } from "@preview-mode";

export type PlayerTheme = "dark" | "light";

export interface WebPlayerOptions {
  components?: TextGameComponentOverrides;
  storage?: {
    prefix?: string;
    migrateLegacy?: boolean;
  };
  mobile?: {
    requirePortrait?: boolean;
    maxShortEdgePx?: number;
  };
  saves?: {
    slots?: number;
  };
  settings?: {
    themes?: readonly PlayerTheme[];
    defaultTheme?: PlayerTheme;
    analytics?: {
      available?: boolean;
      defaultEnabled?: boolean;
    };
    defaultVolumes?: {
      master?: number;
      music?: number;
      sfx?: number;
    };
  };
  assets?: {
    fallbackPortrait?: string;
    fallbackBackground?: string;
  };
}

export interface ResolvedWebPlayerOptions {
  gameId: string;
  storage: {
    prefix: string;
    migrateLegacy: boolean;
  };
  mobile: {
    requirePortrait: boolean;
    maxShortEdgePx: number;
  };
  saves: {
    slots: number;
  };
  settings: {
    themes: readonly PlayerTheme[];
    defaultTheme: PlayerTheme;
    analytics: {
      available: boolean;
      defaultEnabled: boolean;
    };
    defaultVolumes: {
      master: number;
      music: number;
      sfx: number;
    };
  };
  assets: {
    fallbackPortrait?: string;
    fallbackBackground?: string;
  };
}

const DEFAULT_OPTIONS: ResolvedWebPlayerOptions = {
  gameId: "game",
  storage: {
    prefix: "blackbox",
    migrateLegacy: true,
  },
  mobile: {
    requirePortrait: false,
    maxShortEdgePx: 500,
  },
  saves: {
    slots: 3,
  },
  settings: {
    themes: ["dark", "light"],
    defaultTheme: "dark",
    analytics: {
      available: true,
      defaultEnabled: true,
    },
    defaultVolumes: {
      master: 1,
      music: 1,
      sfx: 0.7,
    },
  },
  assets: {},
};

let resolvedOptions = DEFAULT_OPTIONS;

function clampVolume(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function positiveInteger(value: number | undefined, fallback: number, max?: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(1, Math.round(value)));
}

function resolveThemes(options: WebPlayerOptions["settings"]): readonly PlayerTheme[] {
  const requested = options?.themes?.filter(
    (theme, index, themes) =>
      (theme === "dark" || theme === "light") && themes.indexOf(theme) === index,
  );
  return requested?.length ? requested : DEFAULT_OPTIONS.settings.themes;
}

export function configureWebPlayer(gameId: string, options: WebPlayerOptions = {}): void {
  const themes = resolveThemes(options.settings);
  const requestedDefaultTheme = options.settings?.defaultTheme;
  const defaultTheme =
    requestedDefaultTheme && themes.includes(requestedDefaultTheme)
      ? requestedDefaultTheme
      : themes[0]!;

  resolvedOptions = {
    gameId,
    storage: {
      prefix: options.storage?.prefix?.replace(/:+$/, "") || DEFAULT_OPTIONS.storage.prefix,
      migrateLegacy: options.storage?.migrateLegacy ?? DEFAULT_OPTIONS.storage.migrateLegacy,
    },
    mobile: {
      requirePortrait: options.mobile?.requirePortrait ?? DEFAULT_OPTIONS.mobile.requirePortrait,
      maxShortEdgePx: positiveInteger(
        options.mobile?.maxShortEdgePx,
        DEFAULT_OPTIONS.mobile.maxShortEdgePx,
      ),
    },
    saves: {
      slots: positiveInteger(options.saves?.slots, DEFAULT_OPTIONS.saves.slots, 9),
    },
    settings: {
      themes,
      defaultTheme,
      analytics: {
        available:
          options.settings?.analytics?.available ?? DEFAULT_OPTIONS.settings.analytics.available,
        defaultEnabled:
          options.settings?.analytics?.defaultEnabled ??
          DEFAULT_OPTIONS.settings.analytics.defaultEnabled,
      },
      defaultVolumes: {
        master: clampVolume(
          options.settings?.defaultVolumes?.master,
          DEFAULT_OPTIONS.settings.defaultVolumes.master,
        ),
        music: clampVolume(
          options.settings?.defaultVolumes?.music,
          DEFAULT_OPTIONS.settings.defaultVolumes.music,
        ),
        sfx: clampVolume(
          options.settings?.defaultVolumes?.sfx,
          DEFAULT_OPTIONS.settings.defaultVolumes.sfx,
        ),
      },
    },
    assets: {
      fallbackPortrait: options.assets?.fallbackPortrait,
      fallbackBackground: options.assets?.fallbackBackground,
    },
  };
}

export function getWebPlayerOptions(): ResolvedWebPlayerOptions {
  return resolvedOptions;
}

export function playerStorageKey(key: string): string {
  return `${resolvedOptions.storage.prefix}:${resolvedOptions.gameId}:${key}`;
}

export function readPlayerStorage(key: string, legacyKey?: string): string | null {
  try {
    const namespacedKey = playerStorageKey(key);
    const current = localStorage.getItem(namespacedKey);
    if (current !== null || !legacyKey || !resolvedOptions.storage.migrateLegacy) return current;

    const legacy = localStorage.getItem(legacyKey);
    if (legacy === null) return null;
    localStorage.setItem(namespacedKey, legacy);
    localStorage.removeItem(legacyKey);
    return legacy;
  } catch {
    return null;
  }
}

export function writePlayerStorage(key: string, value: string): void {
  try {
    localStorage.setItem(playerStorageKey(key), value);
    notifyStorageChanged();
  } catch {}
}

export function removePlayerStorage(key: string): void {
  try {
    localStorage.removeItem(playerStorageKey(key));
    notifyStorageChanged();
  } catch {}
}

export function clearPlayerStorage(): void {
  try {
    const prefix = playerStorageKey("");
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    notifyStorageChanged();
  } catch {}
}
