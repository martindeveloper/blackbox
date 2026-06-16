import { createContext, use, useEffect, useMemo, useState, type ReactNode } from "react";
import { useUserPrefs } from "../hooks/useUserPrefs.js";

export type ThemeMode = "light" | "dark";
export type ThemePreference = ThemeMode | "device";

export const THEME_PREF_STORAGE_KEY = "blackbox-editor-theme-pref";

interface ThemeContextValue {
  theme: ThemeMode;
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(preference: ThemePreference, systemTheme: ThemeMode): ThemeMode {
  return preference === "device" ? systemTheme : preference;
}

function readStoredPreference(): ThemePreference | null {
  try {
    const stored = localStorage.getItem(THEME_PREF_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "device") return stored;
  } catch {}
  return null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { prefs, ready, updatePrefs } = useUserPrefs();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(
    () => readStoredPreference() ?? "device",
  );
  const [systemTheme, setSystemTheme] = useState<ThemeMode>(getSystemTheme);

  if (ready) {
    const pref = prefs.theme;
    if ((pref === "light" || pref === "dark" || pref === "device") && pref !== themePreference) {
      setThemePreferenceState(pref);
    }
  }

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemTheme(media.matches ? "dark" : "light");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const theme = resolveTheme(themePreference, systemTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_PREF_STORAGE_KEY, themePreference);
    } catch {}
  }, [theme, themePreference]);

  const value = useMemo(
    () => ({
      theme,
      themePreference,
      setThemePreference: (preference: ThemePreference) => {
        setThemePreferenceState(preference);
        updatePrefs({ theme: preference });
      },
    }),
    [theme, themePreference, updatePrefs],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = use(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

export const graphThemeColors: Record<ThemeMode, { grid: string; minimap: string; mask: string }> =
  {
    dark: {
      grid: "#38342e",
      minimap: "#df6c00",
      mask: "rgba(10, 9, 8, 0.8)",
    },
    light: {
      grid: "#cccccc",
      minimap: "#b85600",
      mask: "rgba(232, 232, 232, 0.85)",
    },
  };
