import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAppSettings } from "../context/AppSettings.js";

export function MenuButton({
  index,
  onClick,
  children,
  danger = false,
  dim = false,
  active = false,
  autoFocus = false,
  loading = false,
  blocked = false,
}: {
  index: number;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  dim?: boolean;
  active?: boolean;
  autoFocus?: boolean;
  loading?: boolean;
  blocked?: boolean;
}) {
  const num = String(index).padStart(2, "0");
  return (
    <button
      type="button"
      className={[
        "choice-item",
        danger ? "choice-item--danger" : "",
        dim ? "mm-menu-item--dim" : "",
        active ? "mm-menu-item--active" : "",
        blocked ? "mm-menu-item--blocked" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ width: "100%" }}
      onClick={loading || blocked ? undefined : onClick}
      disabled={blocked}
      autoFocus={autoFocus && !blocked}
    >
      <span className="choice-num">[{num}]</span>
      <span className="flex flex-col flex-1">{children}</span>
      {loading && (
        <span className="mm-btn-loader" aria-hidden="true">
          <span className="mm-btn-loader-track">
            <span className="mm-btn-loader-sweep" />
          </span>
        </span>
      )}
    </button>
  );
}

export function VolumeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <label className="mm-volume-row">
      <span className="mm-volume-label">{label}</span>
      <div className="mm-volume-track-wrap">
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={percent}
          onChange={(e) => onChange(Number(e.currentTarget.value) / 100)}
          className="mm-volume-input"
          style={{ "--slider-value": `${percent}%` } as CSSProperties}
        />
      </div>
      <span className="mm-volume-value">{String(percent).padStart(3, "0")}%</span>
    </label>
  );
}

/** Volume / theme / analytics controls bound to AppSettings. */
export function SettingsPanel() {
  const { t } = useTranslation();
  const {
    theme,
    toggleTheme,
    masterVolume,
    musicVolume,
    sfxVolume,
    analyticsEnabled,
    setMasterVolume,
    setMusicVolume,
    setSfxVolume,
    toggleAnalytics,
  } = useAppSettings();

  return (
    <div className="mm-options-panel">
      <VolumeRow
        label={t("mainMenu.masterVolume")}
        value={masterVolume}
        onChange={setMasterVolume}
      />
      <VolumeRow label={t("mainMenu.musicVolume")} value={musicVolume} onChange={setMusicVolume} />
      <VolumeRow label={t("mainMenu.sfxVolume")} value={sfxVolume} onChange={setSfxVolume} />

      <div className="mm-options-sep" />

      <button type="button" className="mm-theme-toggle" onClick={toggleTheme}>
        <span className="mm-theme-label">{t("mainMenu.themeLabel")}</span>
        <span className="mm-theme-value">
          {theme === "dark" ? t("mainMenu.themeDark") : t("mainMenu.themeLight")}
        </span>
        <span className="mm-theme-arrow">↺</span>
      </button>

      <button type="button" className="mm-theme-toggle" onClick={toggleAnalytics}>
        <span className="mm-theme-label">{t("mainMenu.analyticsLabel")}</span>
        <span className="mm-theme-value">
          {analyticsEnabled ? t("actions.on") : t("actions.off")}
        </span>
        <span className="mm-theme-arrow" aria-hidden>
          ◌
        </span>
      </button>
    </div>
  );
}
