import { useEffect, useMemo, useRef, useState } from "react";
import { indexCharacters } from "../lib/characters.js";
import { useTranslation } from "react-i18next";
import type {
  GameView,
  ItemExamineView,
  RollRecord,
  TextBlock,
  UiNotification,
} from "../../../engine/types/game.js";
import { activeIntelKeys } from "../../../engine/lib/format.js";
import { statAbbrev } from "../lib/vitals.js";
import { useCharacterProfileModal } from "../hooks/useCharacterProfileModal.js";
import { useGamePanelModals } from "../hooks/useGamePanelModals.js";
import { useManagedTexture } from "../../../engine/hooks/useAssetScope.js";
import { useResolutionPresentation } from "../hooks/useResolutionPresentation.js";

import { UI_SHORTCUTS, UI_TIMING } from "../uiConfig.js";
import { ChoiceList } from "./ChoiceList.js";
import {
  ArchiveIcon,
  GridIcon,
  IncidentIcon,
  KeycardIcon,
  LocationIcon,
  SkullIcon,
} from "./Icons.js";
import { NarrativeBlock } from "./NarrativeBlock.js";
import { ResolutionLog } from "./ResolutionLog.js";
import { DamageVignette } from "./DamageVignette.js";
import { VitalsStrip } from "./VitalsStrip.js";

interface GamePanelProps {
  view: GameView;
  lastRolls: RollRecord[];
  notifications: UiNotification[];
  presentationBaselineStats: Record<string, number>;
  presentationLocation?: string;
  resolutionEpoch: number;
  commandPending: boolean;
  examine: ItemExamineView | null;
  onChoose: (choiceId: string) => void;
  onContinue: () => void;
  onExamine: (itemRef: string) => void;
  onUseItem: (itemRef: string, actionId: string) => void;
  onSave: () => void;
  onReturnToChapterStart: () => void;
  onRestart: () => void;
  onOpenLoad: () => void;
  onOpenMainMenu: () => void;
  onCreateSupportBundle: () => void;
}

function firstBlockKey(text: TextBlock[]): string {
  const b = text[0];
  return b ? `${b.kind}\x00${b.text.slice(0, 60)}` : "";
}

function caseNumber(nodeId: string): string {
  let h = 0;
  for (let i = 0; i < nodeId.length; i++) {
    h = (h * 31 + nodeId.charCodeAt(i)) & 0xffffff;
  }
  return `BX-${h.toString(16).toUpperCase().padStart(6, "0")}`;
}

function panelBackgroundImage(url: string): string {
  return `linear-gradient(180deg, var(--game-bg-overlay-top), var(--game-bg-overlay-bottom)), url(${url})`;
}

export function GamePanel({
  view,
  lastRolls,
  notifications,
  presentationBaselineStats,
  presentationLocation,
  resolutionEpoch,
  commandPending,
  examine,
  onChoose,
  onContinue,
  onExamine,
  onUseItem,
  onSave,
  onReturnToChapterStart,
  onRestart,
  onOpenLoad,
  onOpenMainMenu,
  onCreateSupportBundle,
}: GamePanelProps) {
  const { t } = useTranslation();

  const {
    showResolution,
    showNarrative,
    showChoices,
    displayStats,
    damagePulse,
    clearDamagePulse,
  } = useResolutionPresentation({
    nodeId: view.node_id,
    resolutionEpoch,
    textBlockCount: view.text.length,
    authoritativeStats: view.player_stats ?? {},
    baselineStats: presentationBaselineStats,
    rolls: lastRolls,
    notifications,
  });

  const isGameOver = view.mode === "game_over";
  const isEnding = view.mode === "ending";
  const isTerminal = isGameOver || isEnding;
  const characterLookup = useMemo(() => indexCharacters(view.characters ?? []), [view.characters]);
  const { openCharacterProfile } = useCharacterProfileModal();
  const location =
    showNarrative || !presentationLocation ? (view.title ?? view.node_id) : presentationLocation;
  const locationKey = `${location}:${view.mode}`;
  const accentColor = isGameOver
    ? "var(--color-danger)"
    : isEnding
      ? "var(--color-success)"
      : "var(--color-accent)";
  const borderAlpha = isGameOver
    ? "rgba(232,32,32,0.15)"
    : isEnding
      ? "color-mix(in srgb, var(--color-success) 18%, transparent)"
      : "var(--game-border)";
  const borderDim = isGameOver
    ? "rgba(232,32,32,0.07)"
    : isEnding
      ? "color-mix(in srgb, var(--color-success) 10%, transparent)"
      : "var(--game-border-dim)";
  const choiceClass = isGameOver
    ? "choice-item choice-item--danger"
    : isEnding
      ? "choice-item choice-item--success"
      : "choice-item";
  const eventCount = view.events.length;
  const inventoryCount = view.inventory_items.reduce((sum, item) => sum + item.count, 0);
  const memoryKeys = activeIntelKeys(view.flags, view.meta);

  const mobileStats = Object.entries(displayStats ?? {});
  const mobileHpVal = mobileStats.find(([k]) => k === "hp")?.[1];
  const mobileMaxHp = mobileStats.find(([k]) => k === "max_hp")?.[1];
  const mobileCoreStats = mobileStats.filter(([k]) => k !== "hp" && k !== "max_hp");
  const mobileIsLowHp = typeof mobileHpVal === "number" && mobileHpVal <= 3;

  const { showPanel } = useGamePanelModals({
    view,
    memoryKeys,
    isTerminal,
    examine,
    commandPending,
    onExamine,
    onUseItem,
    onSave,
    onOpenMainMenu,
    onRestart,
    onCreateSupportBundle,
  });

  const panelNav = [
    {
      id: "inventory" as const,
      titleKey: "inventory.title",
      shortcutLabelKey: "shortcuts.inventory",
      count: inventoryCount,
      shortcut: UI_SHORTCUTS.inventory,
      Icon: KeycardIcon,
      dSize: 15,
      mSize: 12,
      mLabelKey: "game.mobile.items",
      tone: "inventory",
    },
    {
      id: "memory" as const,
      titleKey: "memory.title",
      shortcutLabelKey: "shortcuts.intel",
      count: memoryKeys.length,
      shortcut: UI_SHORTCUTS.intel,
      Icon: ArchiveIcon,
      dSize: 14,
      mSize: 11,
      mLabelKey: "game.mobile.intel",
      tone: "memory",
    },
    {
      id: "journal" as const,
      titleKey: "journal.title",
      shortcutLabelKey: "shortcuts.journal",
      count: eventCount,
      shortcut: UI_SHORTCUTS.journal,
      Icon: IncidentIcon,
      dSize: 12,
      mSize: 11,
      mLabelKey: "game.mobile.log",
      tone: "journal",
    },
    {
      id: "system" as const,
      titleKey: "menu.sys",
      Icon: GridIcon,
      dSize: 12,
      mSize: 11,
      mLabelKey: "game.mobile.sys",
      tone: "system",
    },
  ];

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const narrativeRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const scrollTrackRef = useRef({
    nodeId: view.node_id,
    contentHeight: 0,
    autoScrollEnabled: false,
    prefixKey: firstBlockKey(view.text),
  });

  const updateScrollHint = (el: HTMLDivElement) => {
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setShowScrollHint(!nearBottom && el.scrollHeight > el.clientHeight + 80);
  };

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    scrollEl.scrollTop = 0;
    scrollTrackRef.current = {
      nodeId: view.node_id,
      contentHeight: narrativeRef.current?.scrollHeight ?? 0,
      autoScrollEnabled: false,
      prefixKey: firstBlockKey(view.text),
    };

    updateScrollHint(scrollEl);
    const hintTimer = setTimeout(() => updateScrollHint(scrollEl), 120);

    return () => {
      clearTimeout(hintTimer);
    };
  }, [view.node_id]);

  // Arm auto-scroll only once the narrative is actually on screen. In
  // dice-first resolutions the narrative mounts well after node navigation
  // (after the dice settle), so a fixed post-nav timer would arm too early and
  // mis-read the narrative's first paint as appended content — yanking the view
  // to the bottom edge. Baselining off `showNarrative` keeps the initial paint
  // anchored at the top while still scrolling on genuine streamed appends.
  useEffect(() => {
    if (!showNarrative) return;
    const track = scrollTrackRef.current;
    if (track.nodeId !== view.node_id) return;

    const baseline = () => {
      track.contentHeight = narrativeRef.current?.scrollHeight ?? track.contentHeight;
    };
    baseline();
    const raf = requestAnimationFrame(baseline);
    const enableTimer = setTimeout(() => {
      baseline();
      track.autoScrollEnabled = true;
      if (scrollRef.current) updateScrollHint(scrollRef.current);
    }, 150);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(enableTimer);
    };
  }, [showNarrative, view.node_id]);

  // Must run after the node_id effect (defined after it) so prefixKey is already reset on node nav.
  useEffect(() => {
    const scrollEl = scrollRef.current;
    const track = scrollTrackRef.current;

    if (track.nodeId !== view.node_id) return;

    const newPrefixKey = firstBlockKey(view.text);
    const isReplacement = newPrefixKey !== track.prefixKey && track.prefixKey !== "";
    track.prefixKey = newPrefixKey;

    if (!isReplacement || !scrollEl) return;

    scrollEl.scrollTop = 0;
    track.contentHeight = narrativeRef.current?.scrollHeight ?? 0;
    track.autoScrollEnabled = false;

    updateScrollHint(scrollEl);
    const hintTimer = setTimeout(() => {
      if (scrollRef.current) updateScrollHint(scrollRef.current);
    }, 120);
    const enableTimer = setTimeout(() => {
      track.autoScrollEnabled = true;
      if (narrativeRef.current) track.contentHeight = narrativeRef.current.scrollHeight;
    }, 150);

    return () => {
      clearTimeout(hintTimer);
      clearTimeout(enableTimer);
    };
  }, [view.text, view.node_id]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const narrativeEl = narrativeRef.current;
    if (!scrollEl || !narrativeEl) return;

    const scrollToNewContent = () => {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: "smooth" });
      setShowScrollHint(false);
    };

    const ro = new ResizeObserver(() => {
      const track = scrollTrackRef.current;
      if (track.nodeId !== view.node_id || !track.autoScrollEnabled) return;

      const nextHeight = narrativeEl.scrollHeight;
      if (nextHeight > track.contentHeight + 4) {
        track.contentHeight = nextHeight;
        scrollToNewContent();
      } else {
        track.contentHeight = nextHeight;
        updateScrollHint(scrollEl);
      }
    });

    ro.observe(narrativeEl);
    return () => ro.disconnect();
  }, [view.node_id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop > 50) setShowScrollHint(false);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const { url: readyBackgroundUrl } = useManagedTexture("node:background", view.background?.src);
  const [backgroundLayers, setBackgroundLayers] = useState<{
    current: string | undefined;
    previous: string | undefined;
  }>(() => ({ current: readyBackgroundUrl, previous: undefined }));

  useEffect(() => {
    setBackgroundLayers((layers) => {
      if (layers.current === readyBackgroundUrl) return layers;
      return { current: readyBackgroundUrl, previous: layers.current };
    });

    const timer = setTimeout(() => {
      setBackgroundLayers((layers) =>
        layers.current === readyBackgroundUrl ? { ...layers, previous: undefined } : layers,
      );
    }, UI_TIMING.backgroundFadeMs);

    return () => clearTimeout(timer);
  }, [readyBackgroundUrl]);

  return (
    <div
      className={`game-panel flex flex-col h-full${isGameOver ? " game-panel--game-over" : ""}${isEnding ? " game-panel--ending" : ""}`}
    >
      <div className="game-bg-stack" aria-hidden>
        {backgroundLayers.previous && (
          <div
            key={`previous-${backgroundLayers.previous}`}
            className="game-bg-layer game-bg-layer--previous"
            style={{ backgroundImage: panelBackgroundImage(backgroundLayers.previous) }}
          />
        )}
        {backgroundLayers.current && (
          <div
            key={`current-${backgroundLayers.current}`}
            className="game-bg-layer game-bg-layer--current"
            style={{ backgroundImage: panelBackgroundImage(backgroundLayers.current) }}
          />
        )}
      </div>

      {isGameOver && (
        <div className="death-signal-field" aria-hidden>
          <svg
            className="death-signal-field__trace"
            viewBox="0 0 1200 180"
            preserveAspectRatio="none"
          >
            <path
              className="death-signal-field__baseline"
              pathLength="1200"
              d="M0 92 H250 L268 91 L278 82 L288 112 L302 42 L318 138 L334 72 L348 92 H1200"
            />
            <path
              className="death-signal-field__signal"
              pathLength="1200"
              d="M0 92 H250 L268 91 L278 82 L288 112 L302 42 L318 138 L334 72 L348 92 H1200"
            />
          </svg>
        </div>
      )}

      {isEnding && (
        <div className="resolve-field" aria-hidden>
          <span className="resolve-field__line" />
          <span className="resolve-field__bloom" />
          <span className="resolve-field__sweep" />
        </div>
      )}

      <DamageVignette
        playerStats={displayStats}
        damagePulse={damagePulse}
        onDamagePulseEnd={(pulseId) => {
          if (damagePulse?.id === pulseId) clearDamagePulse();
        }}
      />

      <div
        key={locationKey}
        className={`location-bar flex-shrink-0 border-b px-4 sm:px-8${isGameOver ? " location-bar--game-over" : ""}${isEnding ? " location-bar--ending" : ""}`}
        style={{ borderColor: borderAlpha }}
      >
        <div className="location-bar__topline">
          <div className="location-bar__heading">
            <span
              className="location-bar__icon"
              style={{
                color: accentColor,
              }}
            >
              {isGameOver ? (
                <SkullIcon size={14} />
              ) : isEnding ? (
                <IncidentIcon size={12} />
              ) : (
                <LocationIcon size={11} />
              )}
            </span>
            <span
              className="location-bar__name tracking-[0.14em] uppercase"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(0.75rem, 2.2vw, 0.9rem)",
                color: accentColor,
                textShadow: isGameOver
                  ? "0 0 20px rgba(232,32,32,0.4)"
                  : isEnding
                    ? "0 0 20px color-mix(in srgb, var(--color-success) 35%, transparent)"
                    : "var(--game-title-shadow)",
              }}
            >
              {location}
            </span>
          </div>

          <span className="case-number flex-shrink-0 hidden sm:block mt-0.5">
            {t("game.casePrefix")} {caseNumber(view.node_id)}
          </span>
        </div>

        <div className="flex items-center gap-3 mt-0.5">
          <span
            className="text-xs truncate"
            style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)", opacity: 0.6 }}
          >
            #{view.node_id}
          </span>
          {view.mode !== "normal" && (
            <span
              className="text-xs tracking-[0.15em] flex-shrink-0"
              style={{
                color: isGameOver
                  ? "rgba(232,32,32,0.55)"
                  : isEnding
                    ? "color-mix(in srgb, var(--color-success) 70%, transparent)"
                    : "var(--color-muted-2)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {t("game.modeSeparator")}{" "}
              {view.mode === "game_over"
                ? t("game.modes.game_over")
                : view.mode === "ending"
                  ? t("game.modes.ending")
                  : (view.mode as string).toUpperCase()}
            </span>
          )}
        </div>
      </div>

      <VitalsStrip
        playerStats={displayStats}
        borderColor={borderDim}
        controls={
          <>
            {panelNav.map(
              ({ id, titleKey, shortcutLabelKey, count, shortcut, Icon, dSize, tone }) => (
                <button
                  key={id}
                  type="button"
                  className={`game-panel-switch game-panel-switch--${tone}`}
                  onClick={() => showPanel(id)}
                  title={
                    shortcut && shortcutLabelKey
                      ? `${t(shortcutLabelKey)} [${shortcut.display}]`
                      : undefined
                  }
                  aria-keyshortcuts={shortcut?.aria}
                  aria-haspopup={id === "system" ? "dialog" : undefined}
                >
                  <Icon size={dSize} />
                  <span>{t(titleKey)}</span>
                  {count !== undefined && <strong>{count}</strong>}
                </button>
              ),
            )}
          </>
        }
      />

      <div className="game-mobile-hud border-b" style={{ borderColor: borderAlpha }}>
        <div className="gmh-main">
          <div className="gmh-actions">
            {panelNav.map(({ id, titleKey, count, Icon, mSize, mLabelKey, tone }) => (
              <button
                key={id}
                type="button"
                className={`gmh-btn gmh-btn--${tone}`}
                onClick={() => showPanel(id)}
                aria-label={t(titleKey)}
                aria-haspopup={id === "system" ? "dialog" : undefined}
              >
                <Icon size={mSize} />
                <span className="gmh-btn-label">{t(mLabelKey)}</span>
                {count !== undefined && count > 0 && (
                  <span className={`gmh-badge gmh-badge--${tone}`}>{count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        {(mobileCoreStats.length > 0 || mobileHpVal !== undefined) && (
          <div className="gmh-stats">
            {mobileCoreStats.map(([key, val]) => (
              <span key={key} className="gmh-stat-pill">
                <span className="gmh-stat-key">{statAbbrev(key, t)}</span>
                <span className="gmh-stat-val">{String(val)}</span>
              </span>
            ))}
            {mobileHpVal !== undefined && (
              <span
                className={`gmh-stat-pill gmh-stat-pill--hp${mobileIsLowHp ? " gmh-stat-pill--low" : ""}`}
              >
                <span className="gmh-stat-key">{t("vitals.hp")}</span>
                <span className="gmh-stat-val">
                  {String(mobileHpVal)}
                  {mobileMaxHp !== undefined && `/${String(mobileMaxHp)}`}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        className={`scroll-fade flex-1 overflow-y-auto px-4 sm:px-8 py-7 sm:py-10${isGameOver ? " death-record-scroll" : ""}${isEnding ? " case-resolved-scroll" : ""}`}
      >
        <div
          ref={contentRef}
          className={`max-w-[42rem] mx-auto${isGameOver ? " death-record" : ""}${isEnding ? " case-resolved" : ""}`}
        >
          {isGameOver && (
            <div className="death-record-seal">
              <span className="death-record-seal__index">{t("game.deathRecordIndex")}</span>
              <span className="death-record-seal__status">{t("game.deathRecordStatus")}</span>
            </div>
          )}

          {isEnding && (
            <div className="case-resolved-seal">
              <span className="case-resolved-seal__index">{t("game.caseResolvedIndex")}</span>
              <span className="case-resolved-seal__status">
                <span className="case-resolved-seal__dot" />
                {t("game.caseResolvedStatus")}
              </span>
            </div>
          )}

          <div
            className={`section-rule transmission-rule mb-8${isGameOver ? " transmission-rule--game-over" : ""}${isEnding ? " transmission-rule--ending" : ""}`}
          >
            {isGameOver ? t("game.finalTransmission") : t("game.fieldReport")}
          </div>

          <div
            className={`narrative-margin mb-10${isGameOver ? " narrative-margin--game-over" : ""}${isEnding ? " narrative-margin--ending" : ""}`}
          >
            <div ref={narrativeRef} className="narrative-stack">
              {showNarrative &&
                view.text.map((block, i) => (
                  <NarrativeBlock
                    key={`${view.node_id}-${i}-${block.kind}`}
                    block={block}
                    prevBlock={view.text[i - 1]}
                    characters={characterLookup}
                    isGameOver={isGameOver}
                    onCharacterProfile={openCharacterProfile}
                  />
                ))}
            </div>
          </div>

          {showResolution && <ResolutionLog rolls={lastRolls} notifications={notifications} />}
        </div>
      </div>

      {showScrollHint && (
        <div
          className="scroll-hint"
          aria-hidden
          onClick={() => scrollRef.current?.scrollBy({ top: 120, behavior: "smooth" })}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M2.5 5.5l5.5 5.5 5.5-5.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      <ChoiceList
        view={view}
        isGameOver={isGameOver}
        isEnding={isEnding}
        isTerminal={isTerminal}
        isRolling={commandPending}
        visible={showChoices}
        choiceClass={choiceClass}
        borderColor={borderAlpha}
        onChoose={onChoose}
        onContinue={onContinue}
        onReturnToChapterStart={onReturnToChapterStart}
        onRestart={onRestart}
        onOpenLoad={onOpenLoad}
        onOpenMainMenu={onOpenMainMenu}
      />
    </div>
  );
}
