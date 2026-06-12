import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type ThemePreference, useTheme } from "../../context/ThemeContext.js";
import { IconButton } from "../ui/IconButton.js";

const OPTIONS: Array<{ id: ThemePreference; icon: typeof Sun; labelKey: string }> = [
  { id: "light", icon: Sun, labelKey: "topBar.themeLight" },
  { id: "dark", icon: Moon, labelKey: "topBar.themeDark" },
  { id: "device", icon: Monitor, labelKey: "topBar.themeDevice" },
];

const CYCLE_ORDER: ThemePreference[] = ["light", "dark", "device"];

export function ThemeSelector() {
  const { t } = useTranslation();
  const { themePreference, setThemePreference } = useTheme();

  const currentIndex = CYCLE_ORDER.indexOf(themePreference);
  const current = OPTIONS.find((option) => option.id === themePreference) ?? OPTIONS[0]!;

  const cycle = () => {
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (baseIndex + 1) % CYCLE_ORDER.length;
    setThemePreference(CYCLE_ORDER[nextIndex]!);
  };

  return (
    <IconButton
      icon={current.icon}
      title={`${t("topBar.theme")}: ${t(current.labelKey)}`}
      aria-label={`${t("topBar.theme")}: ${t(current.labelKey)}`}
      onClick={cycle}
    />
  );
}
