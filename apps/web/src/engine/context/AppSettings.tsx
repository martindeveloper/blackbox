import { createContext, useContext, useLayoutEffect, useState } from "react";
import { analytics } from "../lib/vercelAnalytics.js";
import { clampVolume } from "../lib/math.js";
import { getLogLevel, setLogLevel, type LogLevel } from "../lib/logger.js";

export type Theme = "dark" | "light";
export type { LogLevel };

const LOG_LEVEL_CYCLE: LogLevel[] = ["debug", "info", "warn", "error"];
const VOLUME_PERSIST_DEBOUNCE_MS = 300;

interface AppSettings {
  theme: Theme;
  logLevel: LogLevel;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  analyticsEnabled: boolean;
  toggleTheme: () => void;
  toggleAnalytics: () => void;
  cycleLogLevel: () => void;
  setMasterVolume: (volume: number) => void;
  setMusicVolume: (volume: number) => void;
  setSfxVolume: (volume: number) => void;
}

const AppSettingsContext = createContext<AppSettings>({
  theme: "dark",
  logLevel: "info",
  masterVolume: 1,
  musicVolume: 1,
  sfxVolume: 0.7,
  analyticsEnabled: true,
  toggleTheme: () => {},
  toggleAnalytics: () => {},
  cycleLogLevel: () => {},
  setMasterVolume: () => {},
  setMusicVolume: () => {},
  setSfxVolume: () => {},
});

function readTheme(): Theme {
  try {
    return localStorage.getItem("blackbox_theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function readVolume(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return clampVolume(Number(raw));
  } catch {
    return fallback;
  }
}

function readAnalyticsEnabled(): boolean {
  try {
    return localStorage.getItem("blackbox_analytics_enabled") !== "false";
  } catch {
    return true;
  }
}

function persistSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [logLevel, setLogLevelState] = useState<LogLevel>(getLogLevel);
  const [masterVolume, setMasterVolumeState] = useState(() =>
    readVolume("blackbox_master_volume", 1),
  );
  const [musicVolume, setMusicVolumeState] = useState(() => readVolume("blackbox_music_volume", 1));
  const [sfxVolume, setSfxVolumeState] = useState(() => readVolume("blackbox_sfx_volume", 0.7));
  const [analyticsEnabled, setAnalyticsEnabled] = useState(readAnalyticsEnabled);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    persistSetting("blackbox_theme", theme);
  }, [theme]);

  useLayoutEffect(() => {
    setLogLevel(logLevel);
  }, [logLevel]);

  useLayoutEffect(() => {
    analytics.setEnabled(analyticsEnabled);
    persistSetting("blackbox_analytics_enabled", String(analyticsEnabled));
  }, [analyticsEnabled]);

  useLayoutEffect(() => {
    const timer = setTimeout(() => {
      persistSetting("blackbox_master_volume", String(masterVolume));
      persistSetting("blackbox_music_volume", String(musicVolume));
      persistSetting("blackbox_sfx_volume", String(sfxVolume));
    }, VOLUME_PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [masterVolume, musicVolume, sfxVolume]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  const toggleAnalytics = () => setAnalyticsEnabled((enabled) => !enabled);
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
        logLevel,
        masterVolume,
        musicVolume,
        sfxVolume,
        analyticsEnabled,
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
