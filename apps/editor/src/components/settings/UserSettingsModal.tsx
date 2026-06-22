import {
  Bot,
  Code2,
  FolderOpen,
  History,
  Palette,
  RotateCcw,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
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
import type { McpStatus } from "../../types/electron.js";
import {
  DEFAULT_LEFT_PANEL,
  DEFAULT_RIGHT_PANEL,
  MAX_LEFT_PANEL,
  MAX_RIGHT_PANEL,
  MIN_LEFT_PANEL,
  MIN_RIGHT_PANEL,
  clampLeftPanelWidth,
  clampRightPanelWidth,
} from "../../lib/panelLayout.js";
import { ModalShell } from "../overlay/ModalShell.js";
import { Button } from "../ui/Button.js";
import { McpAuditSection, McpSettingsSection } from "./McpSettingsSection.js";
import { ThemePreferencePicker } from "./ThemePreferencePicker.js";

interface UserSettingsModalProps {
  onClose: () => void;
  initialView?: SettingsView;
}

type SettingsView = "appearance" | "workspace" | "agents" | "audit";

export function UserSettingsModal({ onClose, initialView = "appearance" }: UserSettingsModalProps) {
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
  const [view, setView] = useState<SettingsView>(initialView);
  const [mcpStatus, setMcpStatus] = useState<McpStatus | null>(null);

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
    void window
      .electronAPI!.probeIdes(customIdePath || undefined)
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

  useEffect(() => {
    if (!window.electronAPI) return;
    let cancelled = false;
    void window.electronAPI.getMcpStatus().then((status) => {
      if (!cancelled) setMcpStatus(status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
  const leftWidth = clampLeftPanelWidth(prefs.leftColumnWidth ?? DEFAULT_LEFT_PANEL);
  const rightWidth = clampRightPanelWidth(prefs.rightColumnWidth ?? DEFAULT_RIGHT_PANEL);

  const navigation: Array<{
    id: SettingsView;
    label: string;
    icon: LucideIcon;
    disabled?: boolean;
  }> = [
    { id: "appearance", label: t("settings.appearanceKicker"), icon: Palette },
    ...(isElectron
      ? [
          { id: "workspace" as const, label: t("settings.workspaceKicker"), icon: Code2 },
          { id: "agents" as const, label: t("settings.agentsKicker"), icon: Bot },
          {
            id: "audit" as const,
            label: t("settings.mcpAudit"),
            icon: History,
          },
        ]
      : []),
  ];

  return (
    <ModalShell
      labelledBy="settings-nav-title"
      onClose={onClose}
      footer={
        <Button variant="primary" size="sm" onClick={onClose}>
          {t("common.ok")}
        </Button>
      }
    >
      <div className="user-settings-shell">
        <nav className="user-settings-nav" aria-label={t("settings.title")}>
          <h2 id="settings-nav-title" className="user-settings-nav-title">
            {t("settings.title")}
          </h2>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`user-settings-nav-item${view === item.id ? " user-settings-nav-item--active" : ""}`}
                type="button"
                key={item.id}
                disabled={item.disabled}
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => setView(item.id)}
              >
                <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="user-settings-content">
          {view === "appearance" ? (
            <section className="user-settings-group">
              <span className="user-settings-section-kicker">{t("settings.appearanceKicker")}</span>

              <div className="user-settings-section">
                <header className="user-settings-section-head">
                  <h3 className="user-settings-section-title">{t("topBar.theme")}</h3>
                  <p className="user-settings-section-copy">{t("settings.themeHint")}</p>
                </header>
                <ThemePreferencePicker key={themePreference} />
              </div>

              <div className="user-settings-section">
                <div className="user-settings-layout-head">
                  <header className="user-settings-section-head">
                    <h3 className="user-settings-section-title">{t("settings.layoutTitle")}</h3>
                    <p className="user-settings-section-copy">{t("settings.layoutHint")}</p>
                  </header>
                  <Button
                    variant="ghost"
                    size="sm"
                    leadingIcon={RotateCcw}
                    disabled={layoutIsDefault}
                    onClick={resetLayout}
                  >
                    {t("settings.layoutReset")}
                  </Button>
                </div>
                <div className="user-settings-layout-controls">
                  <LayoutSlider
                    label={t("settings.layoutNavigator")}
                    value={leftWidth}
                    min={MIN_LEFT_PANEL}
                    max={MAX_LEFT_PANEL}
                    onChange={(value) => updatePrefs({ leftColumnWidth: value })}
                  />
                  <LayoutSlider
                    label={t("settings.layoutInspector")}
                    value={rightWidth}
                    min={MIN_RIGHT_PANEL}
                    max={MAX_RIGHT_PANEL}
                    onChange={(value) => updatePrefs({ rightColumnWidth: value })}
                  />
                </div>
              </div>
            </section>
          ) : null}

          {view === "workspace" && isElectron ? (
            <section className="user-settings-group">
              <span className="user-settings-section-kicker">{t("settings.workspaceKicker")}</span>
              <header className="user-settings-section-head">
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
                    <span className="user-settings-ide-option-label">
                      {t("settings.ideCustom")}
                    </span>
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

          {view === "agents" && isElectron ? (
            <McpSettingsSection status={mcpStatus} onStatusChange={setMcpStatus} />
          ) : null}

          {view === "audit" ? <McpAuditSection /> : null}
        </div>
      </div>
    </ModalShell>
  );
}

function LayoutSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const progress = ((value - min) / (max - min)) * 100;
  return (
    <label className="user-settings-layout-control">
      <span className="user-settings-layout-label">
        <span>{label}</span>
        <output>{value}px</output>
      </span>
      <input
        className="user-settings-layout-slider"
        type="range"
        min={min}
        max={max}
        step={4}
        value={value}
        style={{ "--slider-progress": `${progress}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="user-settings-layout-range" aria-hidden="true">
        <span>{min}px</span>
        <span>{max}px</span>
      </span>
    </label>
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
