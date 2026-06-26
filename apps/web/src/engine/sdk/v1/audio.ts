// @engine/sdk/v1/audio - audio API (Blackbox engine API v1).
import type { MusicCue } from "./types.js";
import {
  useAudio as useAudioInternal,
  resetMusicTracking as resetMusicTrackingInternal,
} from "@engine/hooks/useAudio.js";
import type {
  AudioPlaybackConfig as AudioPlaybackConfigInternal,
  MusicPlaybackContext as MusicPlaybackContextInternal,
  MusicFade as MusicFadeInternal,
} from "@engine/hooks/useAudio.js";
import * as engine from "@engine/lib/engine.js";

export type AudioPlaybackConfig<FadeKind extends string> = AudioPlaybackConfigInternal<FadeKind>;
export type MusicPlaybackContext<FadeKind extends string> = MusicPlaybackContextInternal<FadeKind>;
export type MusicFade = MusicFadeInternal;

export const DEFAULT_CHOICE_SFX = engine.DEFAULT_CHOICE_SFX;

export function musicAssetLabel(src: string): string {
  return engine.musicAssetLabel(src);
}

export function resetMusicTracking(): void {
  resetMusicTrackingInternal();
}

export function useAudio<FadeKind extends string>(
  music: MusicCue | undefined,
  config: AudioPlaybackConfig<FadeKind>,
  playback?: MusicPlaybackContext<FadeKind>,
) {
  return useAudioInternal<FadeKind>(music, config, playback);
}
