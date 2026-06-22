import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type ThemePreference, useTheme } from "@/context/ThemeContext.js";
import { Icon } from "@/components/icons/Icon.js";

const OPTIONS: Array<{ id: ThemePreference; icon: typeof Sun; labelKey: string }> = [
  { id: "light", icon: Sun, labelKey: "topBar.themeLight" },
  { id: "dark", icon: Moon, labelKey: "topBar.themeDark" },
  { id: "device", icon: Monitor, labelKey: "topBar.themeDevice" },
];

export function ThemePreferencePicker() {
  const { t } = useTranslation();
  const { themePreference, setThemePreference } = useTheme();

  return (
    <div className="editor-theme-switch" role="radiogroup" aria-label={t("topBar.theme")}>
      {OPTIONS.map((option) => {
        const active = themePreference === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            className={`editor-theme-switch-btn${active ? " editor-theme-switch-btn--active" : ""}`}
            onClick={() => setThemePreference(option.id)}
          >
            <Icon icon={option.icon} size={12} strokeWidth={2.2} />
            <span className="editor-theme-switch-label">{t(option.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
