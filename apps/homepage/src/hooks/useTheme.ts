import { useCallback, useEffect, useState } from "react";
import { useTheme as useNextTheme } from "next-themes";

export type ThemeMode = "light" | "dark" | "auto";

const NEXT_THEME: Record<ThemeMode, ThemeMode> = {
  light: "dark",
  dark: "auto",
  auto: "light",
};

export function cycleTheme(mode: ThemeMode): ThemeMode {
  return NEXT_THEME[mode];
}

export function useTheme() {
  const { theme, setTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const mode: ThemeMode = mounted && (theme === "light" || theme === "dark") ? theme : "auto";

  useEffect(() => {
    setMounted(true);
    if (theme === "auto") {
      setTheme("system");
    }
  }, [setTheme, theme]);

  const setMode = useCallback(
    (nextMode: ThemeMode) => {
      setTheme(nextMode === "auto" ? "system" : nextMode);
    },
    [setTheme],
  );

  return { mode, setMode };
}
