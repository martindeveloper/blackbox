import { useCallback, useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAudio, resetMusicTracking as resetEngineMusicTracking } from "../../hooks/useAudio.js";
import {
  useBlackboxSession,
  type SessionPhase,
  type SessionPresentationAdapter,
} from "../../hooks/useBlackboxSession.js";
import { bundleStore } from "../../lib/bundleStore.js";
import { musicAssetLabel, serializeEngineState } from "../../lib/engine.js";
import { isEditableTarget, matchesShortcut } from "../../lib/keyboard.js";
import { formatPageTitle, pageTitleContextFromSession } from "../../lib/pageTitle.js";
import { downloadSupportBundle } from "../../lib/supportBundle.js";
import type { AudioPlaybackConfig } from "../../hooks/useAudio.js";
import type { MusicCue, SfxCue } from "../../types/game.js";
import { DevConsole } from "../DevConsole.js";
import { useModal, type ModalTone } from "../ModalContext.js";
import { SavePanel } from "../SavePanel.js";
import { useTextGameComponents } from "./TextGamePresentation.js";

export interface TextGamePlayerHeaderProps {
  session: SessionPhase;
  status: string;
  statusKind: "info" | "ready" | "error";
  scenarioTitle: string;
  music?: MusicCue;
  musicLabel: string;
  muted: boolean;
  audioBlocked: boolean;
  toggleMute: () => void;
}

export interface ChapterTransitionProps {
  title: string | null;
  loading: boolean;
  loadingDone: boolean;
}

export interface NewGameConfirmationProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export interface TextGamePlayerAppConfig<FadeKind extends string> {
  presentation: SessionPresentationAdapter;
  audio: AudioPlaybackConfig<FadeKind>;
  mainMenuMusic?: MusicCue;
  musicFadeKind?: (context: {
    session: SessionPhase;
    chapterTransition: string | null;
  }) => FadeKind | undefined;
  resetMusicTracking?: () => void;
  muteShortcut?: string;
  rootClassName?: string;
  rootStyle?: CSSProperties;
  Header?: (props: TextGamePlayerHeaderProps) => ReactNode;
  BootScreen?: (props: { errorMessage?: string }) => ReactNode;
  ChapterTransition?: (props: ChapterTransitionProps) => ReactNode;
  NewGameConfirmation?: (props: NewGameConfirmationProps) => ReactNode;
  saveModal?: {
    icon?: ReactNode;
    tone?: ModalTone;
  };
  newGameModal?: {
    title?: ReactNode;
    titleKey?: string;
    eyebrow?: ReactNode;
    eyebrowKey?: string;
    icon?: ReactNode;
    tone?: ModalTone;
  };
}

function DefaultHeader({
  scenarioTitle,
  status,
  muted,
  audioBlocked,
  toggleMute,
}: TextGamePlayerHeaderProps) {
  const { t } = useTranslation();
  return (
    <header className="text-game-player-header">
      <h1>{scenarioTitle}</h1>
      <span>{status}</span>
      <button type="button" onClick={toggleMute}>
        {audioBlocked ? t("header.enableAudio") : muted ? t("header.unmute") : t("header.mute")}
      </button>
    </header>
  );
}

function DefaultBootScreen({ errorMessage }: { errorMessage?: string }) {
  const { t } = useTranslation();
  return (
    <div className="text-game-boot-screen" role="status">
      <strong>{errorMessage ?? t("preloader.label")}</strong>
      <span>{errorMessage ? t("errors.bootFailed") : t("preloader.sublabel")}</span>
    </div>
  );
}

function DefaultChapterTransition({ title, loading }: ChapterTransitionProps) {
  const { t } = useTranslation();
  if (!title && !loading) return null;
  return (
    <div className="text-game-chapter-transition" role="status">
      {loading ? t("chapter.loading", { defaultValue: "Loading chapter" }) : title}
    </div>
  );
}

function DefaultNewGameConfirmation({ onCancel, onConfirm }: NewGameConfirmationProps) {
  const { t } = useTranslation();
  return (
    <div className="text-game-confirmation">
      <p>{t("confirm.newGameWarning", { defaultValue: "Existing progress will be replaced." })}</p>
      <button type="button" onClick={onCancel}>
        {t("confirm.cancel")}
      </button>
      <button type="button" onClick={onConfirm}>
        {t("confirm.confirm")}
      </button>
    </div>
  );
}

export function TextGamePlayerApp<FadeKind extends string>({
  config,
}: {
  config: TextGamePlayerAppConfig<FadeKind>;
}) {
  const playSfxRef = useRef<(sfx: SfxCue) => void>(() => {});
  const { t } = useTranslation();
  const { openModal, closeModal } = useModal();
  const { MainMenu, GameScreen } = useTextGameComponents();

  const sessionState = useBlackboxSession({
    presentation: config.presentation,
    onSfx: (sfx) => playSfxRef.current(sfx),
  });
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
  } = sessionState;

  const view = session.phase === "ready" ? session.view : undefined;
  const activeMusic = session.phase === "ready" ? view?.music : config.mainMenuMusic;
  const fadeKind = useMemo(
    () => config.musicFadeKind?.({ session, chapterTransition }),
    [chapterTransition, config, session],
  );
  const { playSfx, muted, toggleMute, audioBlocked } = useAudio(activeMusic, config.audio, {
    fadeKind,
  });
  playSfxRef.current = playSfx;

  const scenarioTitle =
    view?.scenario_title?.trim() || bundleStore.projectInfo?.title?.trim() || t("header.brand");
  const musicLabel = activeMusic ? musicAssetLabel(activeMusic.src) : "";

  useEffect(() => {
    document.title = formatPageTitle(
      pageTitleContextFromSession(session, bundleStore.projectInfo?.title),
      t("header.brand"),
    );
  }, [session, t]);

  useEffect(() => {
    if (!config.muteShortcut) return;
    function handleMuteShortcut(event: KeyboardEvent) {
      if (!matchesShortcut(event, config.muteShortcut!)) return;
      if (isEditableTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      event.preventDefault();
      toggleMute();
    }
    document.addEventListener("keydown", handleMuteShortcut);
    return () => document.removeEventListener("keydown", handleMuteShortcut);
  }, [config.muteShortcut, toggleMute]);

  const openSaveModal = useCallback(
    (currentSavedState: string | null) => {
      openModal({
        id: "save",
        title: t("save.title"),
        eyebrow: t("save.eyebrow"),
        icon: config.saveModal?.icon,
        tone: config.saveModal?.tone,
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
    [closeModal, config.saveModal, openModal, restore, t],
  );

  const resetMusic = config.resetMusicTracking ?? resetEngineMusicTracking;
  const handleRestart = useCallback(async () => {
    resetMusic();
    await restart();
  }, [resetMusic, restart]);

  const requestSlotRestart = useCallback(
    (slotIndex: number) => {
      const modalId = "new-game-confirmation";
      const Confirmation = config.NewGameConfirmation ?? DefaultNewGameConfirmation;
      openModal({
        id: modalId,
        title:
          config.newGameModal?.title ??
          (config.newGameModal?.titleKey ? t(config.newGameModal.titleKey) : t("confirm.confirm")),
        eyebrow:
          config.newGameModal?.eyebrow ??
          (config.newGameModal?.eyebrowKey ? t(config.newGameModal.eyebrowKey) : undefined),
        icon: config.newGameModal?.icon,
        tone: config.newGameModal?.tone,
        size: "md",
        children: (
          <Confirmation
            onCancel={() => closeModal(modalId)}
            onConfirm={() => {
              closeModal(modalId);
              resetMusic();
              restartSlot(slotIndex);
            }}
          />
        ),
      });
    },
    [
      closeModal,
      config.NewGameConfirmation,
      config.newGameModal,
      openModal,
      resetMusic,
      restartSlot,
      t,
    ],
  );

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

  const Header = config.Header ?? DefaultHeader;
  const BootScreen = config.BootScreen ?? DefaultBootScreen;
  const ChapterTransition = config.ChapterTransition ?? DefaultChapterTransition;

  return (
    <div className={config.rootClassName ?? "text-game-player-app"} style={config.rootStyle}>
      <Header
        session={session}
        status={status}
        statusKind={statusKind}
        scenarioTitle={scenarioTitle}
        music={activeMusic}
        musicLabel={musicLabel}
        muted={muted}
        audioBlocked={audioBlocked}
        toggleMute={toggleMute}
      />

      <ChapterTransition
        title={chapterTransition}
        loading={chapterLoading}
        loadingDone={chapterLoadingDone}
      />

      <main className="text-game-player-main">
        {session.phase === "loading" || session.phase === "error" ? (
          <BootScreen errorMessage={session.phase === "error" ? session.message : undefined} />
        ) : session.phase === "selecting_slot" ? (
          <MainMenu
            menuLoading={menuLoading}
            initialSlot={session.returnedFromSlot}
            onContinueSlot={continueSlot}
            onRestartSlot={requestSlotRestart}
            onCreateSupportBundle={() => handleCreateSupportBundle(true)}
          />
        ) : (
          <GameScreen
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
