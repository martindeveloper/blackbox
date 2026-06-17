import { FolderOpen, Wrench } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../context/ThemeContext.js";
import { useUserPrefs } from "../../hooks/useUserPrefs.js";
import {
  CUSTOM_IDE_ID,
  DEFAULT_IDE_ID,
  getIdePluginMeta,
  IDE_PLUGINS,
} from "../../../shared/ideRegistry.js";
import type { IdeProbeResult } from "../../types/electron.js";
import { DEFAULT_LEFT_PANEL, DEFAULT_RIGHT_PANEL } from "../../lib/panelLayout.js";
import { ModalShell } from "../overlay/ModalShell.js";
import { Button } from "../ui/Button.js";
import { ThemePreferencePicker } from "./ThemePreferencePicker.js";

interface UserSettingsModalProps {
  onClose: () => void;
}

export function UserSettingsModal({ onClose }: UserSettingsModalProps) {
  const { t } = useTranslation();
  const { prefs, updatePrefs } = useUserPrefs();
  const { themePreference } = useTheme();
  const isElectron = Boolean(window.electronAPI);

  const preferredIde = prefs.preferredIde ?? DEFAULT_IDE_ID;
  const customIdePath = prefs.customIdePath ?? "";

  const [probe, setProbe] = useState<IdeProbeResult | null>(null);
  const [probing, setProbing] = useState(isElectron);
  const [probeNonce, setProbeNonce] = useState(0);
  const [trackedIdePath, setTrackedIdePath] = useState(customIdePath);

  if (isElectron && trackedIdePath !== customIdePath) {
    setTrackedIdePath(customIdePath);
    setProbing(true);
    setProbeNonce((nonce) => nonce + 1);
  }

  const refreshProbe = useCallback(
    async (path = customIdePath) => {
      if (!window.electronAPI) return;
      setProbing(true);
      try {
        setProbe(await window.electronAPI.probeIdes(path || undefined));
      } finally {
        setProbing(false);
      }
    },
    [customIdePath],
  );

  useEffect(() => {
    if (!isElectron) return;
    let cancelled = false;
    void window.electronAPI!
      .probeIdes(customIdePath || undefined)
      .then((result) => {
        if (!cancelled) setProbe(result);
      })
      .finally(() => {
        if (!cancelled) setProbing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isElectron, customIdePath, probeNonce]);

  const pluginAvailability = new Map(
    probe?.plugins.map((entry) => [entry.id, entry.available]) ?? [],
  );

  const selectIde = (ideId: string) => {
    if (ideId !== CUSTOM_IDE_ID && !pluginAvailability.get(ideId)) return;
    updatePrefs({ preferredIde: ideId });
  };

  const browseCustomBinary = async () => {
    const picked = await window.electronAPI?.pickIdeBinary();
    if (!picked) return;
    updatePrefs({ customIdePath: picked, preferredIde: CUSTOM_IDE_ID });
    void refreshProbe(picked);
  };

  const resetLayout = () => {
    updatePrefs({
      leftColumnWidth: DEFAULT_LEFT_PANEL,
      rightColumnWidth: DEFAULT_RIGHT_PANEL,
    });
  };

  const layoutIsDefault =
    (prefs.leftColumnWidth ?? DEFAULT_LEFT_PANEL) === DEFAULT_LEFT_PANEL &&
    (prefs.rightColumnWidth ?? DEFAULT_RIGHT_PANEL) === DEFAULT_RIGHT_PANEL;

  return (
    <ModalShell
      title={t("settings.title")}
      onClose={onClose}
      footer={
        <Button variant="primary" size="sm" onClick={onClose}>
          {t("common.ok")}
        </Button>
      }
    >
      <div className="user-settings">
        <section className="user-settings-section">
          <header className="user-settings-section-head">
            <span className="user-settings-section-kicker">{t("settings.appearanceKicker")}</span>
            <h3 className="user-settings-section-title">{t("topBar.theme")}</h3>
            <p className="user-settings-section-copy">{t("settings.themeHint")}</p>
          </header>
          <ThemePreferencePicker key={themePreference} />
        </section>

        <section className="user-settings-section">
          <header className="user-settings-section-head">
            <span className="user-settings-section-kicker">{t("settings.appearanceKicker")}</span>
            <h3 className="user-settings-section-title">{t("settings.layoutTitle")}</h3>
            <p className="user-settings-section-copy">{t("settings.layoutHint")}</p>
          </header>
          <div className="user-settings-layout-row">
            <span className="user-settings-layout-meta">
              {t("settings.layoutCurrent", {
                left: prefs.leftColumnWidth ?? DEFAULT_LEFT_PANEL,
                right: prefs.rightColumnWidth ?? DEFAULT_RIGHT_PANEL,
              })}
            </span>
            <Button variant="ghost" size="sm" disabled={layoutIsDefault} onClick={resetLayout}>
              {t("settings.layoutReset")}
            </Button>
          </div>
        </section>

        {isElectron ? (
          <section className="user-settings-section">
            <header className="user-settings-section-head">
              <span className="user-settings-section-kicker">{t("settings.workspaceKicker")}</span>
              <h3 className="user-settings-section-title">{t("settings.ideTitle")}</h3>
              <p className="user-settings-section-copy">{t("settings.ideHint")}</p>
            </header>

            <div
              className="user-settings-ide-list"
              role="radiogroup"
              aria-label={t("settings.ideTitle")}
            >
              {IDE_PLUGINS.map((plugin) => {
                const available = pluginAvailability.get(plugin.id) ?? false;
                const selected = preferredIde === plugin.id;
                return (
                  <label
                    key={plugin.id}
                    className={`user-settings-ide-option${selected ? " user-settings-ide-option--active" : ""}${available ? "" : " user-settings-ide-option--unavailable"}`}
                  >
                    <input
                      type="radio"
                      name="preferred-ide"
                      value={plugin.id}
                      checked={selected}
                      disabled={!available}
                      onChange={() => selectIde(plugin.id)}
                    />
                    <span className="user-settings-ide-option-body">
                      <span className="user-settings-ide-option-label">{plugin.label}</span>
                      <span className="user-settings-ide-option-meta">
                        {probing
                          ? t("settings.ideChecking")
                          : available
                            ? t("settings.ideDetected")
                            : t("settings.ideNotDetected")}
                      </span>
                    </span>
                  </label>
                );
              })}

              <label
                className={`user-settings-ide-option user-settings-ide-option--custom${preferredIde === CUSTOM_IDE_ID ? " user-settings-ide-option--active" : ""}`}
              >
                <input
                  type="radio"
                  name="preferred-ide"
                  value={CUSTOM_IDE_ID}
                  checked={preferredIde === CUSTOM_IDE_ID}
                  onChange={() => updatePrefs({ preferredIde: CUSTOM_IDE_ID })}
                />
                <span className="user-settings-ide-option-body">
                  <span className="user-settings-ide-option-label">{t("settings.ideCustom")}</span>
                  <span className="user-settings-ide-option-meta">
                    {probe?.customAvailable
                      ? t("settings.ideDetected")
                      : customIdePath
                        ? t("settings.ideNotDetected")
                        : t("settings.ideCustomHint")}
                  </span>
                </span>
              </label>
            </div>

            {preferredIde === CUSTOM_IDE_ID ? (
              <div className="user-settings-custom-path">
                <input
                  className="editor-input user-settings-custom-input"
                  type="text"
                  spellCheck={false}
                  placeholder={t("settings.ideCustomPlaceholder")}
                  value={customIdePath}
                  onChange={(event) => {
                    const next = event.target.value;
                    updatePrefs({ customIdePath: next });
                  }}
                  onBlur={(event) => void refreshProbe(event.target.value)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  leadingIcon={FolderOpen}
                  onClick={() => void browseCustomBinary()}
                >
                  {t("settings.ideBrowse")}
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </ModalShell>
  );
}

export function UserSettingsButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="ghost"
      size="sm"
      leadingIcon={Wrench}
      onClick={onClick}
      title={t("settings.title")}
      aria-label={t("settings.title")}
    />
  );
}

export function ideLabelForPrefs(preferredIde: string | undefined, customIdePath?: string) {
  if (preferredIde === CUSTOM_IDE_ID) {
    return customIdePath?.trim() || "Custom IDE";
  }
  return getIdePluginMeta(preferredIde ?? DEFAULT_IDE_ID)?.label ?? "IDE";
}
