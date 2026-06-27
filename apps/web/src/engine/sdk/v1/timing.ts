import * as uiTiming from "@engine/lib/uiTiming.js";

export type UiTimingValues = uiTiming.UiTimingValues;
export type UiTiming = uiTiming.UiTiming;
export type MusicFade = uiTiming.MusicFade;
export type MusicFadeKind = uiTiming.MusicFadeKind;

export function createUiTiming(values: UiTimingValues): UiTiming {
  return uiTiming.createUiTiming(values);
}
