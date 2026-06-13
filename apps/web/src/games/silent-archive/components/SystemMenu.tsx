import type { CSSProperties } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppSettings } from "../../../engine/context/AppSettings.js";
import {
  ArchiveIcon,
  IncidentIcon,
  MoonIcon,
  RecorderIcon,
  RestartIcon,
  SunIcon,
} from "./Icons.js";
import { RestartConfirmButtons } from "./RestartConfirm.js";

interface SystemMenuProps {
  isTerminal: boolean;
  onSave: () => void;
  onOpenMainMenu: () => void;
  onRestart: () => void;
  onCreateSupportBundle: () => void;
}

export function SystemMenu({
  isTerminal,
  onSave,
  onOpenMainMenu,
  onRestart,
  onCreateSupportBundle,
}: SystemMenuProps) {
  const { t } = useTranslation();
  const [restartPending, setRestartPending] = useState(false);
  const {
    theme,
    logLevel,
    masterVolume,
    musicVolume,
    sfxVolume,
    analyticsEnabled,
    analyticsAvailable,
    canToggleTheme,
    toggleTheme,
    toggleAnalytics,
    cycleLogLevel,
    setMasterVolume,
    setMusicVolume,
    setSfxVolume,
  } = useAppSettings();

  return (
    <div className="sys-menu-panel" role="menu" aria-label={t("menu.title")}>
      <div className="sys-menu-section">
        <button className="sys-menu-item" role="menuitem" onClick={onOpenMainMenu}>
          <span className="sys-menu-item-icon">
            <RecorderIcon size={11} />
          </span>
          <span className="sys-menu-item-label">{t("menu.mainMenu")}</span>
          <span className="sys-menu-item-arrow">→</span>
        </button>
      </div>

      {!isTerminal && (
        <>
          <div className="sys-menu-sep" />
          <div className="sys-menu-section">
            {restartPending ? (
              <div className="sys-menu-item sys-menu-item--danger sys-menu-item--compact sys-restart-confirming">
                <span className="sys-menu-item-icon">
                  <RestartIcon size={10} />
                </span>
                <span className="sys-menu-item-label">{t("menu.restart")}</span>
                <RestartConfirmButtons
                  onConfirm={onRestart}
                  onCancel={() => setRestartPending(false)}
                />
              </div>
            ) : (
              <button
                className="sys-menu-item sys-menu-item--danger sys-menu-item--compact"
                role="menuitem"
                onClick={() => setRestartPending(true)}
              >
                <span className="sys-menu-item-icon">
                  <RestartIcon size={10} />
                </span>
                <span className="sys-menu-item-label">{t("menu.restart")}</span>
                <span className="sys-menu-danger-badge">{t("menu.irreversible")}</span>
              </button>
            )}
          </div>
        </>
      )}

      <div className="sys-menu-sep" />

      <div className="sys-menu-section sys-menu-section--audio">
        <div className="sys-menu-section-hdr">{t("menu.signalLevels")}</div>
        <SystemSlider
          label={t("menu.masterVolume")}
          value={masterVolume}
          onChange={setMasterVolume}
        />
        <SystemSlider label={t("menu.musicVolume")} value={musicVolume} onChange={setMusicVolume} />
        <SystemSlider label={t("menu.sfxVolume")} value={sfxVolume} onChange={setSfxVolume} />
      </div>

      <div className="sys-menu-sep" />

      <div className="sys-menu-section">
        <div className="sys-menu-section-hdr">{t("menu.systemUtilities")}</div>
        <div className="sys-menu-utility-strip" role="group">
          {canToggleTheme && (
            <button className="sys-menu-utility-btn" role="menuitem" onClick={toggleTheme}>
              <span className="sys-menu-utility-icon">
                {theme === "dark" ? <MoonIcon size={9} /> : <SunIcon size={9} />}
              </span>
              <span>{t("menu.theme")}</span>
              <span className="sys-menu-utility-value">
                {theme === "dark" ? t("actions.dark") : t("actions.light")}
              </span>
            </button>
          )}
          <button className="sys-menu-utility-btn" role="menuitem" onClick={cycleLogLevel}>
            <span className="sys-menu-utility-icon" style={{ fontSize: "0.6rem" }}>
              ◉
            </span>
            <span>{t("menu.logLevel")}</span>
            <span className={`sys-menu-utility-value sys-menu-log-${logLevel}`}>
              {t(`menu.logLevels.${logLevel}`)}
            </span>
          </button>
          {analyticsAvailable && (
            <button className="sys-menu-utility-btn" role="menuitem" onClick={toggleAnalytics}>
              <span className="sys-menu-utility-icon" aria-hidden>
                ◌
              </span>
              <span>{t("menu.analytics")}</span>
              <span className="sys-menu-utility-value">
                {analyticsEnabled ? t("actions.on") : t("actions.off")}
              </span>
            </button>
          )}
          <button className="sys-menu-utility-btn" role="menuitem" onClick={onCreateSupportBundle}>
            <span className="sys-menu-utility-icon">
              <IncidentIcon size={9} />
            </span>
            <span>{t("menu.createSupportBundle")}</span>
            <span className="sys-menu-utility-value">↓</span>
          </button>
          <button className="sys-menu-utility-btn" role="menuitem" onClick={onSave}>
            <span className="sys-menu-utility-icon">
              <ArchiveIcon size={9} />
            </span>
            <span>{t("menu.archive")}</span>
            <span className="sys-menu-utility-value">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function SystemSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const percent = Math.round(value * 100);

  return (
    <label className="sys-menu-slider">
      <span className="sys-menu-slider-head">
        <span className="sys-menu-slider-label">{label}</span>
        <span className="sys-menu-slider-value">{String(percent).padStart(3, "0")}%</span>
      </span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={percent}
        onChange={(event) => onChange(Number(event.currentTarget.value) / 100)}
        style={{ "--slider-value": `${percent}%` } as CSSProperties}
      />
    </label>
  );
}
