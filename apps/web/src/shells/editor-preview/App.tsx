import { collectStateNotifications } from "@engine/sdk/v1/notifications.js";
import { TextGamePlayerApp, type TextGamePlayerHeaderProps } from "@engine/sdk/v1/ui/player-app.js";
import { useTranslation } from "react-i18next";

const PREVIEW_PRESENTATION = {
  collectStateNotifications,
  rollRevealDelayMs: (rollCount: number) => (rollCount > 0 ? 400 : 0),
  chapterTransitionMs: 300,
};

const PREVIEW_AUDIO = {
  musicLoopDelayMs: 0,
  resolveMusicFade: () => ({ fadeIn: 0.15, fadeOut: 0.15 }),
};

export function App() {
  return (
    <TextGamePlayerApp
      config={{
        presentation: PREVIEW_PRESENTATION,
        audio: PREVIEW_AUDIO,
        rootClassName: "text-game-player-app editor-preview",
        Header: PreviewHeader,
      }}
    />
  );
}

function AudioIcon({ muted }: { muted: boolean }) {
  return muted ? (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 8h3l4-3v10l-4-3H4zM14 8l4 4m0-4-4 4" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 8h3l4-3v10l-4-3H4zM14 7c1.5 1.7 1.5 4.3 0 6m2-8c2.6 2.8 2.6 7.2 0 10" />
    </svg>
  );
}

function PreviewHeader({
  scenarioTitle,
  status,
  statusKind,
  paused,
  audioBlocked,
  togglePause,
}: TextGamePlayerHeaderProps) {
  const { t } = useTranslation();
  const audioLabel = audioBlocked
    ? t("header.enableAudio")
    : paused
      ? t("header.unmute")
      : t("header.mute");

  return (
    <header className="preview-header">
      <div className="preview-header__brand">
        <span className="preview-header__mark" aria-hidden="true" />
        <div>
          <span className="preview-header__context">{t("header.brand")}</span>
          <h1>{scenarioTitle}</h1>
        </div>
      </div>
      <div className="preview-header__actions">
        <span className={`preview-status preview-status--${statusKind}`}>
          <span aria-hidden="true" />
          {status}
        </span>
        <button
          type="button"
          className="preview-audio"
          onClick={togglePause}
          aria-label={audioLabel}
        >
          <AudioIcon muted={paused || audioBlocked} />
          <span>{audioLabel}</span>
        </button>
      </div>
    </header>
  );
}
