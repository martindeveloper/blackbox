import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useAppSettings } from "../../../engine/context/AppSettings.js";
import { useManagedTexture } from "../../../engine/hooks/useAssetScope.js";
import { bundleStore } from "../../../engine/lib/bundleStore.js";
import { isEditableTarget } from "../../../engine/lib/keyboard.js";
import {
  clearAllPlayerData,
  clearSlot,
  readAllSlots,
  SLOT_COUNT,
  type SlotData,
} from "../../../engine/lib/slots.js";
import { BugIcon, HeadphonesIcon } from "./Icons.js";
import { RestartConfirmButtons } from "./RestartConfirm.js";

type MenuView = "slots" | "headphones" | "menu";

const HEADPHONES_HOLD_MS = 2100;
const HEADPHONES_FADE_MS = 520;
const LAST_USED_SLOT_KEY = "blackbox_last_used_slot";

interface MainMenuProps {
  menuLoading: boolean;
  initialSlot?: number;
  onContinueSlot: (index: number) => void;
  onRestartSlot: (index: number) => void;
  onCreateSupportBundle: () => void;
}

function relativeTime(isoString: string, t: TFunction): string {
  const ms = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return t("mainMenu.relativeTime.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("mainMenu.relativeTime.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("mainMenu.relativeTime.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("mainMenu.relativeTime.yesterday");
  if (days < 7) return t("mainMenu.relativeTime.daysAgo", { count: days });
  return new Date(isoString).toLocaleDateString();
}

function formatPlaytime(totalPlaytimeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(totalPlaytimeMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function readLastUsedSlot(): number | null {
  try {
    const index = Number(localStorage.getItem(LAST_USED_SLOT_KEY));
    return Number.isInteger(index) && index >= 0 && index < SLOT_COUNT ? index : null;
  } catch {
    return null;
  }
}

function persistLastUsedSlot(index: number | null): void {
  try {
    if (index === null) {
      localStorage.removeItem(LAST_USED_SLOT_KEY);
    } else {
      localStorage.setItem(LAST_USED_SLOT_KEY, String(index));
    }
  } catch {}
}

export function MainMenu({
  menuLoading,
  initialSlot,
  onContinueSlot,
  onRestartSlot,
  onCreateSupportBundle,
}: MainMenuProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<MenuView>(() => (initialSlot !== undefined ? "menu" : "slots"));
  const [selectedSlot, setSelectedSlot] = useState<number | null>(() =>
    initialSlot !== undefined ? initialSlot : null,
  );
  const [slots, setSlots] = useState<(SlotData | null)[]>(() => readAllSlots());
  const [lastUsedSlot, setLastUsedSlot] = useState<number | null>(readLastUsedSlot);
  const [showOptions, setShowOptions] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const { url: bgUrl } = useManagedTexture("main_menu:bg", "textures/backgrounds/mainmenu.png");

  const selectedSlotData = selectedSlot !== null ? (slots[selectedSlot] ?? null) : null;

  const prevMenuLoadingRef = useRef(menuLoading);
  useEffect(() => {
    if (prevMenuLoadingRef.current && !menuLoading) {
      setLoadingAction(null);
    }
    prevMenuLoadingRef.current = menuLoading;
  }, [menuLoading]);

  const handleSelectSlot = useCallback((index: number) => {
    setSelectedSlot(index);
    setShowOptions(false);
    setView("headphones");
  }, []);

  const handleHeadphonesComplete = useCallback(() => {
    setView("menu");
  }, []);

  const handleBack = useCallback(() => {
    if (menuLoading) return;
    setSelectedSlot(null);
    setView("slots");
    setShowOptions(false);
    setSlots(readAllSlots());
  }, [menuLoading]);

  const handleDestroySlot = useCallback(
    (index: number) => {
      clearSlot(index);
      if (lastUsedSlot === index) {
        persistLastUsedSlot(null);
        setLastUsedSlot(null);
      }
      setSlots(readAllSlots());
    },
    [lastUsedSlot],
  );

  const handleDestroyAllData = useCallback(() => {
    clearAllPlayerData();
    window.location.reload();
  }, []);

  const handleContinue = useCallback(() => {
    if (selectedSlot === null || !selectedSlotData || menuLoading) return;
    persistLastUsedSlot(selectedSlot);
    setLastUsedSlot(selectedSlot);
    setLoadingAction("continue");
    onContinueSlot(selectedSlot);
  }, [selectedSlot, selectedSlotData, menuLoading, onContinueSlot]);

  const handleRestart = useCallback(() => {
    if (selectedSlot === null || menuLoading) return;
    persistLastUsedSlot(selectedSlot);
    setLastUsedSlot(selectedSlot);
    setLoadingAction("restart");
    onRestartSlot(selectedSlot);
  }, [selectedSlot, menuLoading, onRestartSlot]);

  useEffect(() => {
    if (view !== "slots" || menuLoading) return;

    function handleSlotKey(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const slotIndex = Number(event.key) - 1;
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= SLOT_COUNT) return;
      event.preventDefault();
      handleSelectSlot(slotIndex);
    }

    document.addEventListener("keydown", handleSlotKey);
    return () => document.removeEventListener("keydown", handleSlotKey);
  }, [handleSelectSlot, menuLoading, view]);

  useEffect(() => {
    if (view !== "menu") return;

    function handleKey(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.key === "1" && selectedSlotData) {
        e.preventDefault();
        handleContinue();
      } else if (e.key === "2") {
        e.preventDefault();
        handleRestart();
      } else if (e.key === "3") {
        e.preventDefault();
        setShowOptions((v) => !v);
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleBack();
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [view, selectedSlotData, handleContinue, handleRestart, handleBack]);

  const inMenu = view === "menu";

  return (
    <div className={`mm-root${inMenu ? " mm-root--menu" : ""}`}>
      <div
        className="mm-bg-image"
        style={{ backgroundImage: bgUrl ? `url(${bgUrl})` : undefined }}
      />

      <div className="mm-bg-vignette" />

      <div className="boot-beam" />

      <div className="mm-bg-glow" />

      {view === "slots" ? (
        <SlotSelector
          slots={slots}
          lastUsedSlot={lastUsedSlot}
          onSelect={handleSelectSlot}
          onDestroySlot={handleDestroySlot}
          onDestroyAllData={handleDestroyAllData}
          t={t}
        />
      ) : view === "headphones" ? (
        <HeadphonesNotice onComplete={handleHeadphonesComplete} t={t} />
      ) : (
        <MenuScreen
          selectedSlot={selectedSlot!}
          slotData={selectedSlotData}
          showOptions={showOptions}
          loadingAction={loadingAction}
          onToggleOptions={() => !menuLoading && setShowOptions((v) => !v)}
          onBack={handleBack}
          onContinue={handleContinue}
          onRestart={handleRestart}
          t={t}
        />
      )}

      {menuLoading && (
        <div className="mm-loading-overlay" aria-live="polite" aria-label={t("status.loading")}>
          <div className="bb-loader mm-loader-bar">
            <div className="bb-loader-bar" />
          </div>
        </div>
      )}

      <footer className="mm-footer-meta">
        <button
          type="button"
          className="mm-footer-support-btn"
          onClick={onCreateSupportBundle}
          title={t("mainMenu.supportBundle")}
          aria-label={t("mainMenu.supportBundle")}
        >
          <BugIcon size={11} />
        </button>
        {bundleStore.projectInfo?.revision ? (
          <span className="mm-footer-version">v{bundleStore.projectInfo.revision}</span>
        ) : null}
      </footer>
    </div>
  );
}

function HeadphonesNotice({
  onComplete,
  t,
}: {
  onComplete: () => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setExiting(true), HEADPHONES_HOLD_MS);
    const doneTimer = window.setTimeout(onComplete, HEADPHONES_HOLD_MS + HEADPHONES_FADE_MS);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`mm-headphones-notice${exiting ? " mm-headphones-notice--out" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="mm-headphones-card">
        <span className="mm-headphones-tag">{t("mainMenu.audioTag")}</span>
        <div className="mm-headphones-icon-wrap">
          <HeadphonesIcon size={36} />
        </div>
        <p className="mm-headphones-title">{t("mainMenu.audioAdvisory")}</p>
        <p className="mm-headphones-hint">{t("mainMenu.headphonesHint")}</p>
        <span className="bracket bracket-tl bracket-amber" />
        <span className="bracket bracket-tr bracket-amber" />
        <span className="bracket bracket-bl bracket-amber" />
        <span className="bracket bracket-br bracket-amber" />
      </div>
    </div>
  );
}

function SlotSelector({
  slots,
  lastUsedSlot,
  onSelect,
  onDestroySlot,
  onDestroyAllData,
  t,
}: {
  slots: (SlotData | null)[];
  lastUsedSlot: number | null;
  onSelect: (index: number) => void;
  onDestroySlot: (index: number) => void;
  onDestroyAllData: () => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const [destroyAllPending, setDestroyAllPending] = useState(false);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "58rem",
        animation: "fade-up 0.4s ease-out both",
      }}
    >
      <div className="flex flex-col items-center mb-10 mm-archive-header">
        <h1 className="mm-archive-title title-glitch">{t("mainMenu.archiveTitle")}</h1>
        <p className="mm-archive-subtitle">{t("mainMenu.selectSlot")}</p>
      </div>

      <div
        className="mm-slot-grid"
        style={{ animation: "fade-up 0.42s ease-out both", animationDelay: "0.15s" }}
      >
        {Array.from({ length: SLOT_COUNT }, (_, index) => (
          <SlotCard
            key={index}
            index={index}
            data={slots[index] ?? null}
            isLastUsed={lastUsedSlot === index}
            delay={0.12 + index * 0.07}
            onSelect={() => onSelect(index)}
            onDestroySlot={onDestroySlot}
            t={t}
          />
        ))}
      </div>

      <div
        className="mm-delete-all-wrap"
        style={{ animation: "fade-up 0.42s ease-out both", animationDelay: "0.38s" }}
      >
        <div className="mm-delete-all-bar">
          <div
            className={`mm-delete-all-state${destroyAllPending ? " mm-delete-all-state--hidden" : ""}`}
          >
            <button
              type="button"
              className="mm-delete-all-btn"
              onClick={() => setDestroyAllPending(true)}
            >
              {t("mainMenu.deleteAllData")}
            </button>
          </div>
          <div
            className={`mm-delete-all-state mm-delete-all-state--confirm${destroyAllPending ? "" : " mm-delete-all-state--hidden"}`}
          >
            <span className="mm-delete-all-confirm-label">{t("confirm.confirm")}</span>
            <button
              type="button"
              className="mm-delete-all-yes"
              onClick={() => {
                onDestroyAllData();
                setDestroyAllPending(false);
              }}
              aria-label={t("mainMenu.confirmDeleteAllData")}
              title={t("confirm.confirm")}
            >
              ✓
            </button>
            <button
              type="button"
              className="mm-delete-all-no"
              onClick={() => setDestroyAllPending(false)}
              aria-label={t("mainMenu.cancelDeleteAllData")}
              title={t("confirm.cancel")}
            >
              ✗
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlotCard({
  index,
  data,
  isLastUsed,
  delay,
  onSelect,
  onDestroySlot,
  t,
}: {
  index: number;
  data: SlotData | null;
  isLastUsed: boolean;
  delay: number;
  onSelect: () => void;
  onDestroySlot: (index: number) => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const [destroyPending, setDestroyPending] = useState(false);
  const occupied = data !== null;
  const num = String(index + 1).padStart(2, "0");

  return (
    <div
      className="mm-slot-card"
      data-occupied={occupied ? "true" : "false"}
      data-last-used={isLastUsed ? "true" : "false"}
      style={{ animationDelay: `${delay}s` }}
      onClick={() => !destroyPending && onSelect()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (destroyPending) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="mm-slot-card-inner">
        <div className="mm-slot-header">
          <span className="mm-slot-num">
            {t("mainMenu.slotLabel")} — {num}
          </span>
          <div className="mm-slot-header-actions">
            {occupied && (
              <div className="mm-slot-destroy-zone" onClick={(e) => e.stopPropagation()}>
                {destroyPending ? (
                  <>
                    <button
                      type="button"
                      className="mm-slot-destroy-confirm"
                      onClick={() => {
                        onDestroySlot(index);
                        setDestroyPending(false);
                      }}
                      aria-label={t("mainMenu.confirmDeleteSlot")}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      className="mm-slot-destroy-cancel"
                      onClick={() => setDestroyPending(false)}
                      aria-label={t("mainMenu.cancelDeleteSlot")}
                    >
                      ✗
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="mm-slot-destroy-btn"
                    onClick={() => setDestroyPending(true)}
                    aria-label={t("mainMenu.deleteSlot")}
                  >
                    ×
                  </button>
                )}
              </div>
            )}
            <span
              className={`mm-slot-badge ${occupied ? "mm-slot-badge--occupied" : "mm-slot-badge--vacant"}`}
            >
              {occupied ? t("mainMenu.occupied") : t("mainMenu.vacantBadge")}
            </span>
          </div>
        </div>

        <div className="mm-slot-rule" />

        {occupied && data ? (
          <div className="mm-slot-body">
            <div className="mm-slot-field">
              <span className="mm-slot-field-label">{t("mainMenu.location")}</span>
              <span className="mm-slot-field-value">
                {data.location ?? data.nodeId ?? t("mainMenu.unknownLocation")}
              </span>
            </div>
            <div className="mm-slot-time-row">
              <div className="mm-slot-field">
                <span className="mm-slot-field-label">{t("mainMenu.lastAccess")}</span>
                <span className="mm-slot-field-value mm-slot-field-value--time">
                  {relativeTime(data.savedAt, t)}
                </span>
              </div>
              <div className="mm-slot-field mm-slot-field--right">
                <span className="mm-slot-field-label">{t("mainMenu.totalPlaytime")}</span>
                <span className="mm-slot-field-value mm-slot-field-value--playtime">
                  {formatPlaytime(data.totalPlaytimeMs)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mm-slot-vacant-body">
            <div className="mm-slot-vacant-lines">
              {[55, 73, 42].map((w, i) => (
                <div key={i} className="mm-slot-vacant-line" style={{ width: `${w}%` }} />
              ))}
            </div>
            <span className="mm-slot-vacant-label">{t("mainMenu.vacantHint")}</span>
          </div>
        )}

        <div className="mm-slot-footer">
          {isLastUsed ? (
            <span className="mm-slot-last-used">
              <span className="mm-slot-last-used-dot" aria-hidden />
              {t("mainMenu.lastUsed")}
            </span>
          ) : (
            <span />
          )}
          <span className="mm-slot-select-hint">
            {occupied ? t("mainMenu.selectHint") : t("mainMenu.newHint")}
          </span>
        </div>
      </div>

      <span className="bracket bracket-tl bracket-amber" />
      <span className="bracket bracket-tr bracket-amber" />
      <span className="bracket bracket-bl bracket-amber" />
      <span className="bracket bracket-br bracket-amber" />
    </div>
  );
}

function MenuScreen({
  selectedSlot,
  slotData,
  showOptions,
  loadingAction,
  onToggleOptions,
  onBack,
  onContinue,
  onRestart,
  t,
}: {
  selectedSlot: number;
  slotData: SlotData | null;
  showOptions: boolean;
  loadingAction: string | null;
  onToggleOptions: () => void;
  onBack: () => void;
  onContinue: () => void;
  onRestart: () => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
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

  const [restartPending, setRestartPending] = useState(false);
  const occupied = slotData !== null;
  const num = String(selectedSlot + 1).padStart(2, "0");
  const isLoading = loadingAction !== null;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "22rem",
        animation: "fade-up 0.38s ease-out both",
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <button
          type="button"
          onClick={onBack}
          className="mm-back-btn"
          disabled={isLoading}
          title={t("mainMenu.backTitle")}
          style={{
            opacity: isLoading ? 0.3 : undefined,
            pointerEvents: isLoading ? "none" : undefined,
          }}
        >
          ← {t("mainMenu.back")}
        </button>
        <div className="mm-back-sep" />
        <span className="mm-back-slot-label">
          {t("mainMenu.slotLabel")} — {num}
        </span>
        {occupied && slotData && (
          <span className="mm-back-time">{relativeTime(slotData.savedAt, t)}</span>
        )}
      </div>

      {occupied && slotData && (
        <div className="mm-slot-mini-card">
          <span className="mm-slot-mini-label">{t("mainMenu.location")}</span>
          <span className="mm-slot-mini-value">
            {slotData.location ?? slotData.nodeId ?? t("mainMenu.unknownLocation")}
          </span>
        </div>
      )}

      <div className="space-y-1 mt-2">
        {occupied ? (
          <>
            <MenuButton
              index={1}
              onClick={onContinue}
              loading={loadingAction === "continue"}
              blocked={isLoading && loadingAction !== "continue"}
              autoFocus
            >
              <span>{t("mainMenu.continue")}</span>
              <span className="mm-menu-hint">{t("mainMenu.continueHint")}</span>
            </MenuButton>

            {restartPending ? (
              <div className="choice-item choice-item--danger mm-restart-confirming">
                <span className="choice-num">[02]</span>
                <span className="flex flex-col flex-1">
                  <span>{t("mainMenu.restart")}</span>
                  <span className="mm-menu-hint mm-menu-hint--danger">
                    {t("mainMenu.restartHint")}
                  </span>
                </span>
                <RestartConfirmButtons
                  onConfirm={onRestart}
                  onCancel={() => setRestartPending(false)}
                />
              </div>
            ) : (
              <MenuButton
                index={2}
                onClick={() => setRestartPending(true)}
                danger
                loading={loadingAction === "restart"}
                blocked={isLoading && loadingAction !== "restart"}
              >
                <span>{t("mainMenu.restart")}</span>
                <span className="mm-menu-hint mm-menu-hint--danger">
                  {t("mainMenu.restartHint")}
                </span>
              </MenuButton>
            )}
          </>
        ) : (
          <MenuButton
            index={1}
            onClick={onRestart}
            loading={loadingAction === "restart"}
            blocked={false}
            autoFocus
          >
            <span>{t("mainMenu.newIncident")}</span>
            <span className="mm-menu-hint">{t("mainMenu.newIncidentHint")}</span>
          </MenuButton>
        )}

        <MenuButton
          index={occupied ? 3 : 2}
          onClick={onToggleOptions}
          active={showOptions}
          blocked={isLoading}
        >
          <span>{t("mainMenu.options")}</span>
          <span className="mm-menu-hint">{t("mainMenu.optionsHint")}</span>
        </MenuButton>

        {showOptions && (
          <div className="mm-options-panel">
            <VolumeRow
              label={t("mainMenu.masterVolume")}
              value={masterVolume}
              onChange={setMasterVolume}
            />
            <VolumeRow
              label={t("mainMenu.musicVolume")}
              value={musicVolume}
              onChange={setMusicVolume}
            />
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
        )}
      </div>
    </div>
  );
}

function MenuButton({
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
  children: React.ReactNode;
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

function VolumeRow({
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
