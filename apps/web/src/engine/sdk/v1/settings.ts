// @engine/sdk/v1/settings - player-settings hook (Blackbox engine API v1).
import { useAppSettings as useAppSettingsInternal } from "@engine/context/AppSettings.js";
import type {
  Theme as ThemeInternal,
  LogLevel as LogLevelInternal,
} from "@engine/context/AppSettings.js";

export type Theme = ThemeInternal;
export type LogLevel = LogLevelInternal;
export type AppSettings = ReturnType<typeof useAppSettingsInternal>;

export function useAppSettings(): AppSettings {
  return useAppSettingsInternal();
}
