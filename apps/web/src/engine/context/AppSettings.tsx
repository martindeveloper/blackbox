import { createContext, useContext, useLayoutEffect, useState } from "react";
import { analytics } from "@analytics";
import { clampVolume } from "../lib/math.js";
import { getLogLevel, setLogLevel, type LogLevel } from "../lib/logger.js";
import {
  getWebPlayerOptions,
  readPlayerStorage,
  writePlayerStorage,
  type PlayerTheme,
} from "../lib/playerConfig.js";

export type Theme = PlayerTheme;
export type { LogLevel };

const LOG_LEVEL_CYCLE: LogLevel[] = ["debug", "info", "warn", "error"];
const VOLUME_PERSIST_DEBOUNCE_MS = 300;

interface AppSettings {
  theme: Theme;
  availableThemes: readonly Theme[];
  canToggleTheme: boolean;
  logLevel: LogLevel;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  analyticsEnabled: boolean;
  analyticsAvailable: boolean;
  toggleTheme: () => void;
  toggleAnalytics: () => void;
  cycleLogLevel: () => void;
  setMasterVolume: (volume: number) => void;
  setMusicVolume: (volume: number) => void;
  setSfxVolume: (volume: number) => void;
}

const AppSettingsContext = createContext<AppSettings>({
  theme: "dark",
  availableThemes: ["dark", "light"],
  canToggleTheme: true,
  logLevel: "info",
  masterVolume: 1,
  musicVolume: 1,
  sfxVolume: 0.7,
  analyticsEnabled: true,
  analyticsAvailable: true,
  toggleTheme: () => {},
  toggleAnalytics: () => {},
  cycleLogLevel: () => {},
  setMasterVolume: () => {},
  setMusicVolume: () => {},
  setSfxVolume: () => {},
});

function readTheme(): Theme {
  const { themes, defaultTheme } = getWebPlayerOptions().settings;
  const stored = readPlayerStorage("theme", "blackbox_theme");
  return stored && themes.includes(stored as Theme) ? (stored as Theme) : defaultTheme;
}

function readVolume(key: string, legacyKey: string, fallback: number): number {
  const raw = readPlayerStorage(key, legacyKey);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? clampVolume(value) : fallback;
}

function readAnalyticsEnabled(): boolean {
  const { available, defaultEnabled } = getWebPlayerOptions().settings.analytics;
  if (!available) return false;
  const stored = readPlayerStorage("analytics-enabled", "blackbox_analytics_enabled");
  return stored === null ? defaultEnabled : stored !== "false";
}

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const settings = getWebPlayerOptions().settings;
  const availableThemes = settings.themes;
  const canToggleTheme = availableThemes.length > 1;
  const analyticsAvailable = settings.analytics.available;
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [logLevel, setLogLevelState] = useState<LogLevel>(getLogLevel);
  const [masterVolume, setMasterVolumeState] = useState(() =>
    readVolume("master-volume", "blackbox_master_volume", settings.defaultVolumes.master),
  );
  const [musicVolume, setMusicVolumeState] = useState(() =>
    readVolume("music-volume", "blackbox_music_volume", settings.defaultVolumes.music),
  );
  const [sfxVolume, setSfxVolumeState] = useState(() =>
    readVolume("sfx-volume", "blackbox_sfx_volume", settings.defaultVolumes.sfx),
  );
  const [analyticsEnabled, setAnalyticsEnabled] = useState(readAnalyticsEnabled);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    writePlayerStorage("theme", theme);
  }, [theme]);

  useLayoutEffect(() => {
    setLogLevel(logLevel);
  }, [logLevel]);

  useLayoutEffect(() => {
    analytics.setEnabled(analyticsEnabled);
    if (analyticsAvailable) {
      writePlayerStorage("analytics-enabled", String(analyticsEnabled));
    }
  }, [analyticsAvailable, analyticsEnabled]);

  useLayoutEffect(() => {
    const timer = setTimeout(() => {
      writePlayerStorage("master-volume", String(masterVolume));
      writePlayerStorage("music-volume", String(musicVolume));
      writePlayerStorage("sfx-volume", String(sfxVolume));
    }, VOLUME_PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [masterVolume, musicVolume, sfxVolume]);

  const toggleTheme = () =>
    setTheme((current) => {
      if (!canToggleTheme) return current;
      const index = availableThemes.indexOf(current);
      return availableThemes[(index + 1) % availableThemes.length]!;
    });
  const toggleAnalytics = () => {
    if (analyticsAvailable) setAnalyticsEnabled((enabled) => !enabled);
  };
  const cycleLogLevel = () =>
    setLogLevelState((l) => {
      const idx = LOG_LEVEL_CYCLE.indexOf(l);
      return LOG_LEVEL_CYCLE[(idx + 1) % LOG_LEVEL_CYCLE.length]!;
    });
  const setMasterVolume = (volume: number) => setMasterVolumeState(clampVolume(volume));
  const setMusicVolume = (volume: number) => setMusicVolumeState(clampVolume(volume));
  const setSfxVolume = (volume: number) => setSfxVolumeState(clampVolume(volume));

  return (
    <AppSettingsContext.Provider
      value={{
        theme,
        availableThemes,
        canToggleTheme,
        logLevel,
        masterVolume,
        musicVolume,
        sfxVolume,
        analyticsEnabled,
        analyticsAvailable,
        toggleTheme,
        toggleAnalytics,
        cycleLogLevel,
        setMasterVolume,
        setMusicVolume,
        setSfxVolume,
      }}
    >
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings(): AppSettings {
  return useContext(AppSettingsContext);
}
