import { DEFAULT_CHOICE_SFX } from "../../../engine/lib/engine.js";
import { resetMusicTracking, useAudio as useEngineAudio } from "../../../engine/hooks/useAudio.js";
import type { MusicCue } from "../../../engine/types/game.js";
import { resolveMusicFade, UI_TIMING, type MusicFadeKind } from "../uiConfig.js";

const AUDIO_CONFIG = {
  defaultSfx: DEFAULT_CHOICE_SFX,
  musicLoopDelayMs: UI_TIMING.musicLoopDelayMs,
  resolveMusicFade,
};

export { resetMusicTracking };

export function useAudio(music: MusicCue | undefined, playback?: { fadeKind?: MusicFadeKind }) {
  return useEngineAudio(music, AUDIO_CONFIG, playback);
}
