import type { TFunction } from "i18next";
import type { MetaCatalog } from "../types/game.js";

export function formatRefId(id: string): string {
  return id.replace(/_/g, " ");
}

export function relativeTime(isoString: string, t: TFunction): string {
  const ms = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return t("mainMenu.relativeTime.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("mainMenu.relativeTime.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("mainMenu.relativeTime.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("mainMenu.relativeTime.yesterday");
  if (days < 7) return t("mainMenu.relativeTime.daysAgo", { count: days });
  return new Date(isoString).toLocaleDateString();
}

export function formatPlaytime(totalPlaytimeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(totalPlaytimeMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function activeFlagKeys(flags: Record<string, unknown>): string[] {
  return Object.entries(flags)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
}

export function activeIntelKeys(flags: Record<string, unknown>, meta: MetaCatalog): string[] {
  return Object.entries(flags)
    .filter(([key, value]) => value === true && meta.flags[key]?.internal === false)
    .map(([key]) => key);
}
