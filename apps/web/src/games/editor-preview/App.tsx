import { collectStateNotifications } from "../../engine/lib/notifications.js";
import { TextGamePlayerApp } from "../../engine/ui/textGame/TextGamePlayerApp.js";

const PREVIEW_PRESENTATION = {
  collectStateNotifications,
  rollRevealDelayMs: (rollCount: number) => (rollCount > 0 ? 400 : 0),
  chapterTransitionMs: 300,
};

const PREVIEW_AUDIO = {
  defaultSfx: undefined,
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
      }}
    />
  );
}
