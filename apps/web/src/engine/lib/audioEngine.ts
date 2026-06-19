import { fetchAudioBytes } from "@content-source";
import { logger } from "./logger.js";
import { clampVolume } from "./math.js";

export interface PlayOptions {
  loop?: boolean;
  loopDelayMs?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
}

export interface StopOptions {
  fadeOut?: number;
}

export interface SfxOptions {
  volume?: number;
}

interface Track {
  src: string;
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  gain: GainNode | null;
  volume: number;
  loop: boolean;
  loopDelayMs: number;
  pendingFadeIn: number;
  playing: boolean;
  offset: number;
  startCtxTime: number | null;
  startOffset: number;
  loopTimer?: ReturnType<typeof setTimeout>;
  cleanup?: ReturnType<typeof setTimeout>;
}

interface Channel {
  gain: GainNode | null;
  volume: number;
  muted: boolean;
  active: Track | null;
  outgoing: Track | null;
}

const FADE_CURVE_STEPS = 128;
const DECLICK_SECS = 0.03;
const RESUME_SETTLE_MS = 150;
const PROGRESS_PROBE_MS = 100;
const MUSIC_CACHE_MAX = 3;

function _fadeOutCurve(fromGain: number): Float32Array {
  const c = new Float32Array(FADE_CURVE_STEPS);
  for (let i = 0; i < FADE_CURVE_STEPS; i++) {
    c[i] = fromGain * Math.cos((i / (FADE_CURVE_STEPS - 1)) * (Math.PI / 2));
  }
  c[FADE_CURVE_STEPS - 1] = 0;
  return c;
}

function _fadeInCurve(toGain: number): Float32Array {
  const c = new Float32Array(FADE_CURVE_STEPS);
  for (let i = 0; i < FADE_CURVE_STEPS; i++) {
    c[i] = toGain * Math.sin((i / (FADE_CURVE_STEPS - 1)) * (Math.PI / 2));
  }
  c[0] = 0;
  return c;
}

function _sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const IOS_AUDIO_QUIRKS =
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export class AudioEngine {
  private _ctx: AudioContext | null = null;
  private _masterGain: GainNode | null = null;
  private _sfxBus: GainNode | null = null;
  private _channels = new Map<string, Channel>();
  private _musicCache = new Map<string, AudioBuffer>();
  private _musicLoading = new Map<string, Promise<AudioBuffer>>();
  private _sfxCache = new Map<string, AudioBuffer>();
  private _sfxLoading = new Map<string, Promise<AudioBuffer>>();
  private _masterVol = 1;
  private _sfxVol = 0.7;
  private _masterMuted = false;
  private _destroyed = false;
  private _sessionUnlocked = false;
  private _selfSuspended = false;
  private _recoveryPending = false;
  private _blockedListener: ((blocked: boolean) => void) | null = null;

  // "interrupted" is a Safari-only state missing from the TS lib types.
  private _state(): string {
    return this._ctx ? (this._ctx.state as string) : "none";
  }

  private _isRunning(): boolean {
    return this._state() === "running";
  }

  private _getCtx(): AudioContext {
    if (this._destroyed) throw new Error("AudioEngine has been destroyed");
    if (!this._ctx) {
      const ctx = new AudioContext();
      this._ctx = ctx;

      this._masterGain = ctx.createGain();
      this._masterGain.gain.value = this._masterMuted ? 0 : this._masterVol;
      this._masterGain.connect(ctx.destination);

      this._sfxBus = ctx.createGain();
      this._sfxBus.gain.value = this._sfxVol;
      this._sfxBus.connect(this._masterGain);

      for (const ch of this._channels.values()) {
        const gain = ctx.createGain();
        gain.gain.value = ch.muted ? 0 : ch.volume;
        gain.connect(this._masterGain);
        ch.gain = gain;
      }

      ctx.onstatechange = () => {
        if (this._ctx !== ctx || this._destroyed) return;
        const state = ctx.state as string;
        logger.debug("audio", "AudioContext statechange", {
          state,
          selfSuspended: this._selfSuspended,
        });
        if (state === "running") {
          this._selfSuspended = false;
          this._syncPlayback();
          this._blockedListener?.(false);
          return;
        }
        if (state === "closed" || this._selfSuspended) return;
        this._recoveryPending = true;
        const visible = typeof document === "undefined" || document.visibilityState === "visible";
        if (visible) {
          this._haltAllTracks();
          this._blockedListener?.(true);
        }
      };
    }
    return this._ctx;
  }

  private _getChannel(name: string): Channel {
    let ch = this._channels.get(name);
    if (!ch) {
      ch = {
        gain: null,
        volume: 1,
        muted: false,
        active: null,
        outgoing: null,
      };
      this._channels.set(name, ch);
    }
    this._ensureChannelGain(ch);
    return ch;
  }

  private _ensureChannelGain(ch: Channel): GainNode {
    if (!ch.gain) {
      const ctx = this._getCtx();
      const gain = ctx.createGain();
      gain.gain.value = ch.muted ? 0 : ch.volume;
      gain.connect(this._masterGain!);
      ch.gain = gain;
    }
    return ch.gain;
  }

  setBlockedListener(listener: ((blocked: boolean) => void) | null): void {
    this._blockedListener = listener;
  }

  unlockGesture(): void {
    if (this._destroyed) return;

    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) {
        // This is game audio, not long-form media. "playback" opts iOS into
        // Now Playing / Dynamic Island media controls; "ambient" keeps output
        // inside the game audio session and respects the hardware mute switch.
        nav.audioSession.type = "ambient";
      }
    } catch {}

    // Suppress Now Playing metadata so iOS doesn't display track info on the lock screen.
    try {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = "none";
      }
    } catch {}

    this._sessionUnlocked = true;

    const ctx = this._getCtx();
    if (!this._isRunning()) {
      ctx.resume().catch(() => {});
    }
  }

  private async _verifyProgress(): Promise<boolean> {
    const ctx = this._ctx;
    if (!ctx) return false;
    if (!this._isRunning()) {
      await _sleep(RESUME_SETTLE_MS);
      if (this._ctx !== ctx || !this._isRunning()) {
        logger.debug("audio", "AudioContext progress check failed", { state: this._state() });
        return false;
      }
    }
    const t0 = ctx.currentTime;
    await _sleep(PROGRESS_PROBE_MS);
    const healthy = this._ctx === ctx && this._isRunning() && ctx.currentTime > t0;
    if (!healthy) {
      logger.debug("audio", "AudioContext progress check failed", {
        state: this._state(),
        advanced: this._ctx === ctx ? ctx.currentTime - t0 : null,
      });
    }
    return healthy;
  }

  async ensureRunning(): Promise<boolean> {
    if (this._destroyed) return false;
    this._getCtx();

    const forceRebuild = this._recoveryPending && IOS_AUDIO_QUIRKS;
    if (!forceRebuild) {
      if (!this._isRunning()) {
        this._ctx?.resume().catch(() => {});
      }
      this._syncPlayback();
      if (await this._verifyProgress()) {
        this._recoveryPending = false;
        this._syncPlayback();
        return true;
      }
      if (this._destroyed) return false;
    }

    logger.warn("audio", "Rebuilding AudioContext", {
      state: this._state(),
      forced: forceRebuild,
    });
    this._rebuildContext();
    if (!this._isRunning()) {
      this._ctx?.resume().catch(() => {});
    }
    this._syncPlayback();
    const healthy = await this._verifyProgress();
    if (this._destroyed) return false;
    if (healthy) {
      this._recoveryPending = false;
      this._syncPlayback();
    }
    logger.debug("audio", "AudioContext rebuild result", {
      state: this._state(),
      healthy,
    });
    return healthy;
  }

  private _rebuildContext(): void {
    for (const ch of this._channels.values()) {
      if (ch.outgoing) {
        this._destroyTrack(ch.outgoing);
        ch.outgoing = null;
      }
      if (ch.active) {
        this._haltTrack(ch.active);
        ch.active.gain = null;
      }
      ch.gain = null;
    }

    const old = this._ctx;
    this._ctx = null;
    this._masterGain = null;
    this._sfxBus = null;
    if (old) {
      old.onstatechange = null;
      old.close().catch(() => {});
    }

    this._getCtx();
    for (const name of this._channels.keys()) {
      this._getChannel(name);
    }
  }

  isBlocked(): boolean {
    return !!this._ctx && !this._isRunning();
  }

  hasPlayingTrack(channelName: string): boolean {
    const ch = this._channels.get(channelName);
    return !!ch?.active?.playing;
  }

  play(channelName: string, src: string, opts: PlayOptions = {}): void {
    const ctx = this._getCtx();
    const ch = this._getChannel(channelName);
    const { loop = false, loopDelayMs = 0, volume = 1, fadeIn = 0, fadeOut = 0 } = opts;
    const now = ctx.currentTime;

    if (ch.outgoing) {
      this._destroyTrack(ch.outgoing);
      ch.outgoing = null;
    }

    if (ch.active) {
      const old = ch.active;
      ch.active = null;

      if (fadeOut > 0 && old.gain && old.source && this._isRunning()) {
        ch.outgoing = old;
        old.playing = false;
        const currentGain = old.gain.gain.value;
        old.gain.gain.cancelScheduledValues(now);
        old.gain.gain.setValueAtTime(currentGain, now);
        old.gain.gain.setValueCurveAtTime(_fadeOutCurve(currentGain), now, fadeOut);
        old.cleanup = setTimeout(
          () => {
            this._destroyTrack(old);
            if (ch.outgoing === old) ch.outgoing = null;
          },
          (fadeOut + 0.15) * 1000,
        );
      } else {
        this._destroyTrack(old);
      }
    }

    const track: Track = {
      src,
      buffer: null,
      source: null,
      gain: null,
      volume,
      loop,
      loopDelayMs,
      pendingFadeIn: fadeIn,
      playing: true,
      offset: 0,
      startCtxTime: null,
      startOffset: 0,
    };
    ch.active = track;

    this._loadMusic(src)
      .then((buffer) => {
        if (this._destroyed || ch.active !== track) return;
        track.buffer = buffer;
        if (this._isRunning()) {
          this._startTrack(ch, track);
        }
      })
      .catch(() => {
        if (ch.active === track) ch.active = null;
        this._destroyTrack(track);
      });
  }

  stop(channelName: string, opts: StopOptions = {}): void {
    const ch = this._channels.get(channelName);
    if (!ch) return;

    const { fadeOut = 0 } = opts;

    if (ch.outgoing) {
      this._destroyTrack(ch.outgoing);
      ch.outgoing = null;
    }

    if (!ch.active) return;
    const track = ch.active;
    ch.active = null;
    track.playing = false;

    if (fadeOut > 0 && track.gain && track.source && this._isRunning()) {
      ch.outgoing = track;
      const now = this._ctx!.currentTime;
      const currentGain = track.gain.gain.value;
      track.gain.gain.cancelScheduledValues(now);
      track.gain.gain.setValueAtTime(currentGain, now);
      track.gain.gain.setValueCurveAtTime(_fadeOutCurve(currentGain), now, fadeOut);
      track.cleanup = setTimeout(
        () => {
          this._destroyTrack(track);
          if (ch.outgoing === track) ch.outgoing = null;
        },
        (fadeOut + 0.15) * 1000,
      );
    } else {
      this._destroyTrack(track);
    }
  }

  private _startTrack(ch: Channel, track: Track): void {
    if (!track.buffer || !track.playing || !this._isRunning()) return;
    if (track.source || track.loopTimer !== undefined) return;
    const ctx = this._ctx!;
    const chGain = this._ensureChannelGain(ch);

    const duration = track.buffer.duration;
    let offset = track.offset;
    if (track.loop) {
      offset = duration > 0 ? offset % duration : 0;
    } else if (offset >= duration) {
      track.playing = false;
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = track.buffer;
    // Use native loop only when no delay is requested — avoids any gap in that case.
    source.loop = track.loop && track.loopDelayMs === 0;

    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(chGain);

    const target = ch.muted ? 0 : track.volume;
    const now = ctx.currentTime;
    if (track.pendingFadeIn > 0) {
      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueCurveAtTime(_fadeInCurve(target), now, track.pendingFadeIn);
      track.pendingFadeIn = 0;
    } else if (offset > 0) {
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(target, now + DECLICK_SECS);
    } else {
      gain.gain.setValueAtTime(target, now);
    }

    track.source = source;
    track.gain = gain;
    track.startCtxTime = now;
    track.startOffset = offset;

    source.onended = () => {
      if (track.source !== source) return;
      track.source = null;
      track.startCtxTime = null;
      if (!track.loop) {
        track.playing = false;
        track.offset = duration;
        return;
      }
      // Delayed loop: re-arm after the gap (native loops never end on their own).
      track.offset = 0;
      track.loopTimer = setTimeout(() => {
        track.loopTimer = undefined;
        if (ch.active === track) this._startTrack(ch, track);
      }, track.loopDelayMs);
    };

    source.start(0, offset);
    logger.debug("audio", "Track started", { src: track.src, offset });
  }

  private _haltTrack(track: Track): void {
    if (track.loopTimer !== undefined) {
      clearTimeout(track.loopTimer);
      track.loopTimer = undefined;
      track.offset = 0;
    }
    const { source } = track;
    if (source) {
      if (track.startCtxTime !== null && this._ctx && track.buffer) {
        const elapsed = Math.max(0, this._ctx.currentTime - track.startCtxTime);
        const pos = track.startOffset + elapsed;
        const duration = track.buffer.duration;
        track.offset = track.loop && duration > 0 ? pos % duration : Math.min(pos, duration);
      }
      track.source = null;
      track.startCtxTime = null;
      source.onended = null;
      try {
        source.stop();
      } catch {}
      try {
        source.disconnect();
      } catch {}
    }
    if (track.gain) {
      try {
        track.gain.disconnect();
      } catch {}
      track.gain = null;
    }
  }

  private _haltAllTracks(): void {
    for (const ch of this._channels.values()) {
      if (ch.outgoing) {
        this._destroyTrack(ch.outgoing);
        ch.outgoing = null;
      }
      if (ch.active) this._haltTrack(ch.active);
    }
  }

  private _syncPlayback(): void {
    if (!this._isRunning()) return;
    if (this._masterGain && this._ctx) {
      const target = this._masterMuted ? 0 : this._masterVol;
      this._masterGain.gain.cancelScheduledValues(this._ctx.currentTime);
      this._masterGain.gain.setValueAtTime(target, this._ctx.currentTime);
    }
    for (const ch of this._channels.values()) {
      if (ch.active) this._startTrack(ch, ch.active);
    }
  }

  private _destroyTrack(track: Track): void {
    if (track.cleanup !== undefined) {
      clearTimeout(track.cleanup);
      track.cleanup = undefined;
    }
    track.playing = false;
    this._haltTrack(track);
  }

  suspendForBackground(): void {
    if (!this._ctx) return;
    logger.debug("audio", "Suspending for background", { state: this._state() });
    this._selfSuspended = true;
    this._recoveryPending = true;
    if (this._masterGain) {
      this._masterGain.gain.cancelScheduledValues(this._ctx.currentTime);
      this._masterGain.gain.setValueAtTime(0, this._ctx.currentTime);
    }
    this._haltAllTracks();
    if (this._state() === "running") {
      this._ctx.suspend().catch(() => {});
    }
  }

  async resumeFromBackground(): Promise<boolean> {
    if (!this._ctx || this._destroyed) return false;
    logger.debug("audio", "Resuming from background", { state: this._state() });
    if (!this._isRunning()) {
      this._ctx.resume().catch(() => {});
    }
    const healthy = await this._verifyProgress();
    if (this._destroyed) return false;
    if (healthy) {
      this._syncPlayback();
      if (!IOS_AUDIO_QUIRKS) this._recoveryPending = false;
    }
    logger.debug("audio", "Background resume result", {
      state: this._state(),
      healthy,
    });
    return !healthy;
  }

  muteMaster(fadeSecs = 0): void {
    this._masterMuted = true;
    if (!this._masterGain) return;
    const ctx = this._getCtx();
    const now = ctx.currentTime;
    if (fadeSecs > 0) {
      this._masterGain.gain.setValueAtTime(this._masterGain.gain.value, now);
      this._masterGain.gain.linearRampToValueAtTime(0, now + fadeSecs);
    } else {
      this._masterGain.gain.setValueAtTime(0, now);
    }
  }

  unmuteMaster(fadeSecs = 0): void {
    this._masterMuted = false;
    if (!this._masterGain) return;
    const ctx = this._getCtx();
    const now = ctx.currentTime;
    if (fadeSecs > 0) {
      this._masterGain.gain.setValueAtTime(this._masterGain.gain.value, now);
      this._masterGain.gain.linearRampToValueAtTime(this._masterVol, now + fadeSecs);
    } else {
      this._masterGain.gain.setValueAtTime(this._masterVol, now);
    }
  }

  isMasterMuted(): boolean {
    return this._masterMuted;
  }

  muteChannel(channelName: string, fadeSecs = 0): void {
    const ch = this._getChannel(channelName);
    ch.muted = true;
    if (!ch.gain) return;
    const now = this._getCtx().currentTime;
    if (fadeSecs > 0) {
      ch.gain.gain.setValueAtTime(ch.gain.gain.value, now);
      ch.gain.gain.linearRampToValueAtTime(0, now + fadeSecs);
    } else {
      ch.gain.gain.setValueAtTime(0, now);
    }
  }

  unmuteChannel(channelName: string, fadeSecs = 0): void {
    const ch = this._getChannel(channelName);
    ch.muted = false;
    if (!ch.gain) return;
    const now = this._getCtx().currentTime;
    if (fadeSecs > 0) {
      ch.gain.gain.setValueAtTime(ch.gain.gain.value, now);
      ch.gain.gain.linearRampToValueAtTime(ch.volume, now + fadeSecs);
    } else {
      ch.gain.gain.setValueAtTime(ch.volume, now);
    }
  }

  isChannelMuted(channelName: string): boolean {
    return this._channels.get(channelName)?.muted ?? false;
  }

  setMasterVolume(volume: number, fadeSecs = 0): void {
    this._masterVol = clampVolume(volume);
    if (this._masterMuted || !this._masterGain) return;
    const ctx = this._getCtx();
    const now = ctx.currentTime;
    if (fadeSecs > 0) {
      this._masterGain.gain.setValueAtTime(this._masterGain.gain.value, now);
      this._masterGain.gain.linearRampToValueAtTime(this._masterVol, now + fadeSecs);
    } else {
      this._masterGain.gain.setValueAtTime(this._masterVol, now);
    }
  }

  setChannelVolume(channelName: string, volume: number, fadeSecs = 0): void {
    const ch = this._getChannel(channelName);
    ch.volume = clampVolume(volume);
    if (!ch.gain) return;
    const now = this._getCtx().currentTime;
    const targetVolume = ch.muted ? 0 : ch.volume;
    if (fadeSecs > 0) {
      ch.gain.gain.setValueAtTime(ch.gain.gain.value, now);
      ch.gain.gain.linearRampToValueAtTime(targetVolume, now + fadeSecs);
    } else {
      ch.gain.gain.setValueAtTime(targetVolume, now);
    }
  }

  setSfxVolume(volume: number): void {
    this._sfxVol = clampVolume(volume);
    if (!this._sfxBus) return;
    const ctx = this._getCtx();
    this._sfxBus.gain.setValueAtTime(this._sfxVol, ctx.currentTime);
  }

  playSfx(src: string, opts: SfxOptions = {}): void {
    if (this._masterMuted) return;
    const { volume = 1 } = opts;

    this._loadSfx(src)
      .then((buffer) => {
        if (this._destroyed || !this._isRunning()) return;
        const ctx = this._ctx!;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        source.connect(gain);
        gain.connect(this._sfxBus!);
        source.start();
        source.onended = () => {
          source.disconnect();
          gain.disconnect();
        };
      })
      .catch(() => {});
  }

  preloadSfx(srcs: string[]): void {
    for (const src of srcs) {
      this._loadSfx(src).catch(() => {});
    }
  }

  releaseSfx(src: string): boolean {
    const removed = this._sfxCache.delete(src);
    this._sfxLoading.delete(src);
    return removed;
  }

  private async _decode(src: string, kind: "music" | "sfx"): Promise<AudioBuffer> {
    const bytes = await fetchAudioBytes(src);
    if (!bytes) {
      logger.error("audio", `${kind} asset missing from bundle`, { src });
      throw new Error(`Audio asset not found in bundle: ${src}`);
    }
    // decodeAudioData detaches the ArrayBuffer, so hand it a copy each attempt.
    const copy = () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    try {
      return await this._getCtx().decodeAudioData(copy() as ArrayBuffer);
    } catch {
      try {
        return await this._getCtx().decodeAudioData(copy() as ArrayBuffer);
      } catch (error) {
        logger.error("audio", `${kind} decode failed`, { src, error });
        throw error;
      }
    }
  }

  private _loadMusic(src: string): Promise<AudioBuffer> {
    const cached = this._musicCache.get(src);
    if (cached) {
      this._musicCache.delete(src);
      this._musicCache.set(src, cached);
      return Promise.resolve(cached);
    }
    const loading = this._musicLoading.get(src);
    if (loading) return loading;

    const promise = this._decode(src, "music")
      .then((decoded) => {
        this._musicCache.set(src, decoded);
        while (this._musicCache.size > MUSIC_CACHE_MAX) {
          const oldest = this._musicCache.keys().next().value;
          if (oldest === undefined) break;
          this._musicCache.delete(oldest);
        }
        this._musicLoading.delete(src);
        return decoded;
      })
      .catch((err) => {
        this._musicLoading.delete(src);
        throw err;
      });

    this._musicLoading.set(src, promise);
    return promise;
  }

  private _loadSfx(src: string): Promise<AudioBuffer> {
    const cached = this._sfxCache.get(src);
    if (cached) return Promise.resolve(cached);

    const loading = this._sfxLoading.get(src);
    if (loading) return loading;

    const promise = this._decode(src, "sfx")
      .then((decoded) => {
        this._sfxCache.set(src, decoded);
        this._sfxLoading.delete(src);
        return decoded;
      })
      .catch((err) => {
        this._sfxLoading.delete(src);
        throw err;
      });

    this._sfxLoading.set(src, promise);
    return promise;
  }

  destroy(): void {
    this._destroyed = true;
    for (const ch of this._channels.values()) {
      if (ch.active) this._destroyTrack(ch.active);
      if (ch.outgoing) this._destroyTrack(ch.outgoing);
    }
    this._channels.clear();
    this._musicCache.clear();
    this._musicLoading.clear();
    this._sfxCache.clear();
    this._sfxLoading.clear();
    this._blockedListener = null;
    if (this._ctx) {
      this._ctx.onstatechange = null;
      this._ctx.close().catch(() => {});
    }
    this._ctx = null;
    this._masterGain = null;
    this._sfxBus = null;
  }
}
