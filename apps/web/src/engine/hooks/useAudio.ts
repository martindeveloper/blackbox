import { useCallback, useEffect, useRef, useState } from "react";
import { useAppSettings } from "../context/AppSettings.js";
import { assetManager } from "../lib/assetManager.js";
import { AudioEngine, IOS_AUDIO_QUIRKS } from "../lib/audioEngine.js";
import { logger } from "../lib/logger.js";
import { Profiler } from "../lib/profiler.js";
import type { MusicCue, SfxCue } from "../types/game.js";

const MUSIC_CHANNEL = "music";

export interface MusicFade {
  fadeIn: number;
  fadeOut: number;
}

export interface AudioPlaybackConfig<FadeKind extends string> {
  defaultSfx?: string;
  musicLoopDelayMs: number;
  resolveMusicFade: (fadeKind: FadeKind | undefined, hadTrack: boolean) => MusicFade;
}

export interface MusicPlaybackContext<FadeKind extends string> {
  fadeKind?: FadeKind;
}
const SFX_CACHE_TTL_MS = 120_000;

let sharedEngine: AudioEngine | null = null;
let sharedMusicKey: string | null = null;
let preloadedDefaultSfx: string | null = null;

function getSharedEngine(defaultSfx?: string): AudioEngine {
  if (!sharedEngine) {
    const engine = new AudioEngine();
    sharedEngine = engine;
    assetManager.registerSfxReleaseHandler((src) => {
      const released = engine.releaseSfx(src);
      if (released) {
        logger.debug("audio", "SFX buffer released", { src });
      }
    });
    logger.debug("audio", "AudioEngine initialized", {
      defaultSfx,
    });
  }
  if (defaultSfx && preloadedDefaultSfx !== defaultSfx) {
    sharedEngine.preloadSfx([defaultSfx]);
    preloadedDefaultSfx = defaultSfx;
  }
  return sharedEngine;
}

export function resetMusicTracking(): void {
  sharedMusicKey = null;
}

export function useAudio<FadeKind extends string>(
  music: MusicCue | undefined,
  config: AudioPlaybackConfig<FadeKind>,
  playback?: MusicPlaybackContext<FadeKind>,
) {
  const { masterVolume, musicVolume, sfxVolume } = useAppSettings();
  const [muted, setMuted] = useState(() => getSharedEngine(config.defaultSfx).isMasterMuted());
  const [audioBlocked, setAudioBlocked] = useState(() =>
    getSharedEngine(config.defaultSfx).isBlocked(),
  );

  // Always-current ref so the unlock callback (captured once) can replay whatever is active.
  const musicRef = useRef(music);
  useEffect(() => {
    musicRef.current = music;
  });

  // Holds the live recovery routine so toggleMute's "enable audio" tap can run the
  // exact same robust path instead of a divergent (and previously buggy) copy.
  const runUnlockRef = useRef<() => void>(() => {});

  useEffect(() => {
    const engine = getSharedEngine(config.defaultSfx);
    let armed = false;
    let unlockInFlight = false;

    const replayMusicIfStopped = () => {
      const m = musicRef.current;
      // ensureRunning already re-rendered any existing track onto the context; only
      // (re)create one when the channel has no live playback intent.
      if (!m || engine.hasPlayingTrack(MUSIC_CHANNEL)) return;
      const loopDelayMs = m.loop ? config.musicLoopDelayMs : 0;
      const { fadeIn } = config.resolveMusicFade(undefined, false);
      engine.play(MUSIC_CHANNEL, m.src, {
        loop: m.loop,
        loopDelayMs,
        fadeIn,
        fadeOut: 0,
      });
      logger.debug("audio", "Resumed music after unlock", { src: m.src });
    };

    const runUnlock = () => {
      if (unlockInFlight) return;
      unlockInFlight = true;
      armed = false;

      engine.unlockGesture();

      engine
        .ensureRunning()
        .then((running) => {
          unlockInFlight = false;
          setAudioBlocked(!running);
          logger.debug("audio", "AudioContext unlock attempt", { running });
          if (running) {
            replayMusicIfStopped();
          } else {
            arm();
          }
        })
        .catch((error: unknown) => {
          unlockInFlight = false;
          logger.warn("audio", "Audio unlock failed", error);
          arm();
        });
    };
    runUnlockRef.current = runUnlock;

    // touchend/click are reliable iOS activation events; pointerdown(touch) is not.
    const arm = () => {
      if (armed) return;
      armed = true;
      document.addEventListener("click", runUnlock, {
        once: true,
        capture: true,
      });
      document.addEventListener("touchend", runUnlock, {
        once: true,
        capture: true,
      });
      document.addEventListener("keydown", runUnlock, { once: true });
    };

    arm();

    engine.setBlockedListener((blocked) => {
      setAudioBlocked(blocked);
      if (blocked) arm();
    });

    const suspend = () => {
      engine.suspendForBackground();
    };
    let resumeInFlight = false;
    // No "did we see the hide event first?" gate — iOS can background the page
    // without firing visibilitychange/pagehide, so foreground signals must always
    // attempt recovery (resumeFromBackground is idempotent and cheap when healthy).
    const resume = () => {
      if (resumeInFlight) return;
      resumeInFlight = true;
      engine.resumeFromBackground().then((gestureRequired) => {
        resumeInFlight = false;
        // Drive the icon from the honest signal only — never force "enable audio"
        // while audio is actually playing (that was the muted-icon-but-sound desync).
        setAudioBlocked(gestureRequired);
        // Separately, arm a one-shot recovery gesture. On iOS the "running but silent"
        // trap means gestureRequired can be a false negative, so re-arm whenever music
        // is active there too — the next tap then performs the engine's forced
        // rebuild, which is near-seamless when audio was actually fine.
        if (gestureRequired || (IOS_AUDIO_QUIRKS && musicRef.current != null)) {
          arm();
        }
      });
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        suspend();
        return;
      }
      resume();
    };

    // iOS Safari may not fire visibilitychange "visible" when returning to a tab
    // after minimize — use focus / pageshow as reliable fallbacks. Likewise
    // "hidden" can be skipped on minimize, so pagehide doubles as the suspend
    // signal (suspendForBackground is idempotent).
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", suspend);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);

    return () => {
      engine.setBlockedListener(null);
      document.removeEventListener("click", runUnlock, true);
      document.removeEventListener("touchend", runUnlock, true);
      document.removeEventListener("keydown", runUnlock);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", suspend);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
    };
  }, [config]);

  useEffect(() => {
    getSharedEngine(config.defaultSfx).setMasterVolume(masterVolume, 0.12);
  }, [config.defaultSfx, masterVolume]);

  useEffect(() => {
    getSharedEngine(config.defaultSfx).setChannelVolume(MUSIC_CHANNEL, musicVolume, 0.2);
  }, [config.defaultSfx, musicVolume]);

  useEffect(() => {
    getSharedEngine(config.defaultSfx).setSfxVolume(sfxVolume);
  }, [config.defaultSfx, sfxVolume]);

  const fadeKind = playback?.fadeKind;

  useEffect(() => {
    const nextKey = music ? `${music.src}:${music.loop}` : null;
    if (nextKey === sharedMusicKey) return;

    const engine = getSharedEngine(config.defaultSfx);
    const hadTrack = sharedMusicKey !== null;
    sharedMusicKey = nextKey;
    const { fadeIn, fadeOut } = config.resolveMusicFade(fadeKind, hadTrack);

    if (music) {
      const loopDelayMs = music.loop ? config.musicLoopDelayMs : 0;
      logger.debug("audio", `Music cue -> ${music.src}`, {
        ref_id: music.ref_id,
        loop: music.loop,
        loopDelayMs,
        fadeKind: fadeKind ?? "default",
        fadeIn,
        fadeOut,
      });
      Profiler.event("audio.track_changed", music.src, {
        refId: music.ref_id,
        loop: music.loop,
      });
      engine.play(MUSIC_CHANNEL, music.src, {
        loop: music.loop,
        loopDelayMs,
        fadeIn,
        fadeOut,
      });
      setAudioBlocked(engine.isBlocked());
    } else {
      logger.debug("audio", "Music stopped", {
        fadeKind: fadeKind ?? "default",
        fadeOut,
      });
      Profiler.event("audio.track_stopped", "music");
      engine.stop(MUSIC_CHANNEL, { fadeOut });
    }
  }, [config, music, fadeKind]);

  const toggleMute = useCallback(() => {
    const engine = getSharedEngine(config.defaultSfx);
    if (audioBlocked) {
      if (engine.isMasterMuted()) {
        engine.unmuteMaster(0.25);
        setMuted(false);
      }
      runUnlockRef.current();
      return;
    }
    if (engine.isMasterMuted()) {
      engine.unmuteMaster(0.25);
      logger.debug("audio", "Audio unmuted");
    } else {
      engine.muteMaster(0.25);
      logger.debug("audio", "Audio muted");
    }
    setMuted(engine.isMasterMuted());
  }, [audioBlocked, config.defaultSfx]);

  const playSfx = useCallback(
    (sfx: SfxCue) => {
      logger.debug("audio", `SFX → ${sfx.src}`, { ref_id: sfx.ref_id });
      Profiler.event("audio.sfx_played", sfx.src, { refId: sfx.ref_id });
      assetManager.touchEphemeral(`audio:sfx:${sfx.src}`, "sfx", sfx.src, SFX_CACHE_TTL_MS);
      getSharedEngine(config.defaultSfx).playSfx(sfx.src);
    },
    [config.defaultSfx],
  );

  return { playSfx, muted, toggleMute, audioBlocked };
}
