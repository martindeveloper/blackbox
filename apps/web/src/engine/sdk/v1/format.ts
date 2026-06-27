import type { TFunction } from "i18next";
import type { MetaCatalog } from "./types.js";
import * as format from "@engine/lib/format.js";

export function formatRefId(id: string): string {
  return format.formatRefId(id);
}

export function relativeTime(isoString: string, t: TFunction): string {
  return format.relativeTime(isoString, t);
}

export function formatPlaytime(totalPlaytimeMs: number): string {
  return format.formatPlaytime(totalPlaytimeMs);
}

export function activeFlagKeys(flags: Record<string, unknown>): string[] {
  return format.activeFlagKeys(flags);
}

export function activeIntelKeys(flags: Record<string, unknown>, meta: MetaCatalog): string[] {
  return format.activeIntelKeys(flags, meta);
}
