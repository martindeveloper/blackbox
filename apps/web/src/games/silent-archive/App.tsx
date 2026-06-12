import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { GamePanel } from "./components/GamePanel.js";
import { DevConsole } from "../../engine/ui/DevConsole.js";
import { ArchiveIcon, MuteIcon, RecorderIcon, VolumeIcon } from "./components/Icons.js";

import { MainMenu } from "./components/MainMenu.js";
import { SavePanel } from "../../engine/ui/SavePanel.js";
import { useModal } from "../../engine/ui/ModalContext.js";
import { useAudio, resetMusicTracking } from "./hooks/useAudio.js";
import { useBlackboxSession } from "../../engine/hooks/useBlackboxSession.js";
import { musicAssetLabel, serializeEngineState } from "../../engine/lib/engine.js";
import { isEditableTarget, matchesShortcut } from "../../engine/lib/keyboard.js";
import { bundleStore } from "../../engine/lib/bundleStore.js";
import { formatPageTitle, pageTitleContextFromSession } from "../../engine/lib/pageTitle.js";
import { downloadSupportBundle } from "../../engine/lib/supportBundle.js";
import type { MusicCue, SfxCue } from "../../engine/types/game.js";
import { collectStateNotifications } from "./lib/notifications.js";
import {
  resolutionLeadMs,
  rollsSequenceMs,
  UI_CSS_VARS,
  UI_SHORTCUTS,
  UI_TIMING,
  type MusicFadeKind,
} from "./uiConfig.js";

const MAIN_MENU_MUSIC_CUE: MusicCue = {
  ref_id: "main_menu",
  src: "music/MainMenu.wav",
  loop: true,
};

const SESSION_PRESENTATION = {
  collectStateNotifications,
  rollRevealDelayMs: (rollCount: number) => resolutionLeadMs() + rollsSequenceMs(rollCount),
  chapterTransitionMs: UI_TIMING.chapterTransitionMs,
};

export function App() {
  const playSfxRef = useRef<(sfx: SfxCue) => void>(() => {});
  const { t } = useTranslation();
  const { openModal, closeModal } = useModal();

  const {
    session,
    status,
    statusKind,
    savedState,
    menuLoading,
    lastRolls,
    notifications,
    presentationBaselineStats,
    presentationLocation,
    resolutionEpoch,
    examine,
    chapterTransition,
    chapterLoading,
    chapterLoadingDone,
    commandPending,
    executeDevCommand,
    choose,
    continueStory,
    examineItem,
    useItem,
    restart,
    returnToChapterStart,
    goToMainMenu,
    save,
    restore,
    continueSlot,
    restartSlot,
  } = useBlackboxSession({
    presentation: SESSION_PRESENTATION,
    onSfx: (sfx) => playSfxRef.current(sfx),
  });

  const view = session.phase === "ready" ? session.view : undefined;
  const activeMusic = session.phase === "ready" ? view?.music : MAIN_MENU_MUSIC_CUE;

  const musicFadeKind = useMemo((): MusicFadeKind | undefined => {
    if (view?.mode === "game_over" && view.music == null) return "death_stop";
    if (chapterTransition) return "chapter";
    return undefined;
  }, [view?.mode, view?.music, chapterTransition]);

  const { playSfx, muted, toggleMute, audioBlocked } = useAudio(activeMusic, {
    fadeKind: musicFadeKind,
  });
  playSfxRef.current = playSfx;

  const hasMusic = activeMusic != null;
  const musicLabel = activeMusic ? musicAssetLabel(activeMusic.src) : "";
  const scenarioTitle =
    view?.scenario_title?.trim() || bundleStore.projectInfo?.title?.trim() || t("header.subtitle");

  useEffect(() => {
    const ctx = pageTitleContextFromSession(session, bundleStore.projectInfo?.title);
    document.title = formatPageTitle(ctx, t("header.brand"));
  }, [session, t]);

  useEffect(() => {
    function handleMuteShortcut(event: KeyboardEvent) {
      if (!matchesShortcut(event, UI_SHORTCUTS.mute.key)) return;
      if (isEditableTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;

      event.preventDefault();
      toggleMute();
    }

    document.addEventListener("keydown", handleMuteShortcut);
    return () => document.removeEventListener("keydown", handleMuteShortcut);
  }, [toggleMute]);

  const openSaveModal = useCallback(
    (currentSavedState: string | null) => {
      openModal({
        id: "save",
        title: t("save.title"),
        eyebrow: t("save.eyebrow"),
        icon: <ArchiveIcon size={15} />,
        tone: "amber",
        size: "lg",
        children: (
          <SavePanel
            savedState={currentSavedState}
            onRestore={(stateJson) => {
              restore(stateJson);
              closeModal("save");
            }}
            onClose={() => closeModal("save")}
          />
        ),
      });
    },
    [t, openModal, closeModal, restore],
  );

  const handleRestart = useCallback(async () => {
    resetMusicTracking();
    await restart();
  }, [restart]);

  const handleSave = useCallback(() => openSaveModal(save()), [openSaveModal, save]);

  const handleOpenLoad = useCallback(() => openSaveModal(savedState), [openSaveModal, savedState]);

  const handleCreateSupportBundle = useCallback(
    (fromMenu = false) => {
      if (fromMenu) {
        downloadSupportBundle({ status: t("status.mainMenu"), statusKind: "info" });
        return;
      }
      if (commandPending || session.phase !== "ready") return;
      downloadSupportBundle({
        stateJson: serializeEngineState(session.engine),
        view: session.view,
        status,
        statusKind,
      });
    },
    [commandPending, session, status, statusKind, t],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-bg" style={UI_CSS_VARS}>
      <header
        className="flex-shrink-0 flex items-center gap-2.5 px-4 sm:px-6 h-12 border-b border-border-2"
        style={{
          background: "var(--color-surface)",
          boxShadow: "0 1px 0 rgba(255,109,26,0.06), 0 4px 24px rgba(0,0,0,0.5)",
        }}
      >
        <div className="app-header-brand min-w-0 flex-1">
          <div className="app-hdr-desktop app-header-title-block min-w-0">
            <h1 className="app-header-title title-glitch">{scenarioTitle}</h1>
            {view?.chapter_title && <p className="app-header-chapter">{view.chapter_title}</p>}
          </div>
          <div className="app-hdr-mobile app-header-title-block min-w-0">
            <h1 className="app-header-title" style={{ fontSize: "clamp(0.78rem, 3.5vw, 1rem)" }}>
              {session.phase === "ready"
                ? (view?.title ?? view?.node_id ?? scenarioTitle)
                : scenarioTitle}
            </h1>
            {view?.chapter_title && <p className="app-header-chapter">{view.chapter_title}</p>}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          {hasMusic && (
            <div
              className="hidden sm:flex items-center gap-2"
              style={{ opacity: muted ? 0.3 : 0.85, transition: "opacity 0.35s" }}
            >
              <MusicBars active={!muted && !audioBlocked} />
              <span
                className="text-xs tracking-[0.1em]"
                style={{ color: "var(--color-muted-2)", fontFamily: "var(--font-mono)" }}
              >
                {audioBlocked && !muted ? t("header.enableAudio") : musicLabel}
              </span>
            </div>
          )}

          <button
            onClick={toggleMute}
            className="sys-btn sys-btn-icon"
            style={{
              padding: "4px 8px",
              color: muted || audioBlocked ? "var(--color-muted)" : "var(--color-muted-2)",
            }}
            title={`${audioBlocked ? t("header.enableAudio") : muted ? t("shortcuts.unmute") : t("shortcuts.mute")} [${UI_SHORTCUTS.mute.display}]`}
            aria-label={
              audioBlocked ? t("header.enableAudio") : muted ? t("header.unmute") : t("header.mute")
            }
            aria-keyshortcuts={UI_SHORTCUTS.mute.aria}
          >
            {muted || audioBlocked ? <MuteIcon size={12} /> : <VolumeIcon size={12} />}
          </button>

          <div className="flex items-center gap-2 pl-1">
            <span className={`status-dot status-dot--${statusKind}`} />
            <span
              className="app-header-status-text text-xs tracking-wide truncate max-w-[100px] sm:max-w-[200px]"
              style={{ color: "rgba(138,104,72,0.7)", fontFamily: "var(--font-mono)" }}
            >
              {status}
            </span>
          </div>
        </div>
      </header>

      {chapterLoading && (
        <div
          className="chapter-transition chapter-transition--loading"
          aria-live="polite"
          aria-label={t("chapter.loading")}
        >
          <div className="ct-bar ct-bar--top" aria-hidden="true" />
          <div className="ct-bar ct-bar--bottom" aria-hidden="true" />
          <div className="ct-content">
            <div className="ct-chapter-loader">
              <div className="bb-loader">
                <div className="bb-loader-bar" />
              </div>
            </div>
          </div>
        </div>
      )}

      {chapterTransition && (
        <div
          className={`chapter-transition${chapterLoadingDone ? " chapter-transition--was-loading" : ""}`}
          aria-live="polite"
        >
          <div className="ct-bar ct-bar--top" aria-hidden="true" />
          <div className="ct-bar ct-bar--bottom" aria-hidden="true" />
          <div className="ct-content">
            <p className="ct-eyebrow">{t("chapter.entering")}</p>
            <div className="ct-rule" aria-hidden="true" />
            <h2 className="ct-title">{chapterTransition}</h2>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-hidden">
        {session.phase === "loading" || session.phase === "error" ? (
          <BootScreen errorMessage={session.phase === "error" ? session.message : undefined} />
        ) : session.phase === "selecting_slot" ? (
          <MainMenu
            menuLoading={menuLoading}
            initialSlot={session.returnedFromSlot}
            onContinueSlot={continueSlot}
            onRestartSlot={restartSlot}
            onCreateSupportBundle={() => handleCreateSupportBundle(true)}
          />
        ) : (
          <GamePanel
            view={session.view}
            lastRolls={lastRolls}
            notifications={notifications}
            presentationBaselineStats={presentationBaselineStats}
            presentationLocation={presentationLocation}
            resolutionEpoch={resolutionEpoch}
            commandPending={commandPending}
            examine={examine}
            onChoose={choose}
            onContinue={continueStory}
            onExamine={examineItem}
            onUseItem={useItem}
            onSave={handleSave}
            onReturnToChapterStart={returnToChapterStart}
            onRestart={handleRestart}
            onOpenLoad={handleOpenLoad}
            onOpenMainMenu={goToMainMenu}
            onCreateSupportBundle={handleCreateSupportBundle}
          />
        )}
      </main>

      <DevConsole
        enabled={Boolean(
          (globalThis as typeof globalThis & { __BLACKBOX_DEV__?: boolean }).__BLACKBOX_DEV__,
        )}
        onExecute={executeDevCommand}
      />
    </div>
  );
}

function MusicBars({ active }: { active: boolean }) {
  const bars: Array<{ h: number; dur: number; delay: number }> = [
    { h: 5, dur: 0.65, delay: 0 },
    { h: 9, dur: 0.5, delay: 0.14 },
    { h: 12, dur: 0.72, delay: 0.07 },
    { h: 8, dur: 0.58, delay: 0.21 },
    { h: 4, dur: 0.63, delay: 0.11 },
  ];

  return (
    <div className="flex items-end gap-px" style={{ height: 12 }}>
      {bars.map((b, i) => (
        <div
          key={i}
          className={active ? "music-bar-live" : ""}
          style={{
            width: 2,
            height: `${b.h}px`,
            background: "var(--color-accent)",
            borderRadius: "1px 1px 0 0",
            animationDuration: `${b.dur}s`,
            animationDelay: active ? `${b.delay}s` : "0s",
          }}
        />
      ))}
    </div>
  );
}

function BootScreen({ errorMessage }: { errorMessage?: string }) {
  const { t } = useTranslation();

  return (
    <div className="relative flex flex-col items-center justify-center h-full gap-7 overflow-hidden">
      <div className="boot-beam" />

      <div
        style={{
          color: errorMessage ? "var(--color-danger)" : "var(--color-accent)",
          opacity: 0.65,
          filter: errorMessage
            ? "drop-shadow(0 0 24px rgba(232,32,32,0.4))"
            : "drop-shadow(0 0 24px rgba(255,109,26,0.5))",
          animation: "fade-up 0.5s ease-out both",
          animationDelay: "0.1s",
        }}
      >
        <RecorderIcon size={48} />
      </div>

      <div
        className="text-center space-y-2"
        style={{ animation: "fade-up 0.45s ease-out both", animationDelay: "0.25s" }}
      >
        <div
          className="tracking-[0.42em]"
          style={{
            color: errorMessage ? "var(--color-danger)" : "var(--color-accent)",
            fontFamily: "var(--font-display)",
            fontSize: "clamp(0.9rem, 3vw, 1.1rem)",
            textShadow: errorMessage
              ? "0 0 24px rgba(232,32,32,0.4)"
              : "0 0 24px rgba(255,109,26,0.45)",
          }}
        >
          {errorMessage ?? t("boot.corp")}
        </div>
        <div
          className="text-xs tracking-[0.25em]"
          style={{ color: "var(--color-muted-2)", fontFamily: "var(--font-mono)", opacity: 0.7 }}
        >
          {errorMessage ? t("boot.failed") : t("boot.accessing")}
        </div>
      </div>

      <div
        className="flex gap-2"
        style={{ animation: "fade-up 0.4s ease-out both", animationDelay: "0.4s" }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="boot-dot" style={{ animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
    </div>
  );
}
