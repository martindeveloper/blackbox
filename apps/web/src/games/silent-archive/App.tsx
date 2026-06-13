import { useTranslation } from "react-i18next";
import { ContentWarning } from "./components/ContentWarning.js";
import { ArchiveIcon, MuteIcon, RecorderIcon, VolumeIcon } from "./components/Icons.js";
import { resetMusicTracking } from "../../engine/hooks/useAudio.js";
import { DEFAULT_CHOICE_SFX } from "../../engine/lib/engine.js";
import type { MusicCue } from "../../engine/types/game.js";
import {
  TextGamePlayerApp,
  type ChapterTransitionProps,
  type NewGameConfirmationProps,
  type TextGamePlayerAppConfig,
  type TextGamePlayerHeaderProps,
} from "../../engine/ui/textGame/TextGamePlayerApp.js";
import { collectStateNotifications } from "./lib/notifications.js";
import {
  resolveMusicFade,
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

const PLAYER_CONFIG: TextGamePlayerAppConfig<MusicFadeKind> = {
  presentation: SESSION_PRESENTATION,
  audio: {
    defaultSfx: DEFAULT_CHOICE_SFX,
    musicLoopDelayMs: UI_TIMING.musicLoopDelayMs,
    resolveMusicFade,
  },
  mainMenuMusic: MAIN_MENU_MUSIC_CUE,
  musicFadeKind: ({ session, chapterTransition }) => {
    const view = session.phase === "ready" ? session.view : undefined;
    if (view?.mode === "game_over" && view.music == null) return "death_stop";
    if (chapterTransition) return "chapter";
    return undefined;
  },
  resetMusicTracking,
  muteShortcut: UI_SHORTCUTS.mute.key,
  rootClassName: "flex flex-col h-full overflow-hidden bg-bg",
  rootStyle: UI_CSS_VARS,
  Header: SilentArchiveHeader,
  BootScreen,
  ChapterTransition: SilentArchiveChapterTransition,
  NewGameConfirmation: SilentArchiveNewGameConfirmation,
  saveModal: {
    icon: <ArchiveIcon size={15} />,
    tone: "amber",
  },
  newGameModal: {
    titleKey: "contentWarning.title",
    eyebrowKey: "contentWarning.eyebrow",
    tone: "amber",
  },
};

export function App() {
  return <TextGamePlayerApp config={PLAYER_CONFIG} />;
}

function SilentArchiveHeader({
  session,
  status,
  statusKind,
  scenarioTitle,
  music,
  musicLabel,
  muted,
  audioBlocked,
  toggleMute,
}: TextGamePlayerHeaderProps) {
  const { t } = useTranslation();
  const view = session.phase === "ready" ? session.view : undefined;
  const hasMusic = music != null;
  return (
    <header
      className="flex-shrink-0 flex items-center gap-2 px-3 sm:px-5 h-10 border-b border-border-2"
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

      <div className="ml-auto flex items-center gap-2">
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
            padding: "3px 7px",
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
  );
}

function SilentArchiveChapterTransition({ title, loading, loadingDone }: ChapterTransitionProps) {
  const { t } = useTranslation();
  if (loading) {
    return (
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
    );
  }
  if (!title) return null;
  return (
    <div
      className={`chapter-transition${loadingDone ? " chapter-transition--was-loading" : ""}`}
      aria-live="polite"
    >
      <div className="ct-bar ct-bar--top" aria-hidden="true" />
      <div className="ct-bar ct-bar--bottom" aria-hidden="true" />
      <div className="ct-content">
        <p className="ct-eyebrow">{t("chapter.entering")}</p>
        <div className="ct-rule" aria-hidden="true" />
        <h2 className="ct-title">{title}</h2>
      </div>
    </div>
  );
}

function SilentArchiveNewGameConfirmation({ onCancel, onConfirm }: NewGameConfirmationProps) {
  return <ContentWarning onCancel={onCancel} onConfirm={onConfirm} />;
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
