import type { MetaCatalog } from "../types/game.js";

export function formatRefId(id: string): string {
  return id.replace(/_/g, " ");
}

export function activeFlagKeys(flags: Record<string, unknown>): string[] {
  return Object.entries(flags)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
}

export function activeIntelKeys(flags: Record<string, unknown>, meta: MetaCatalog): string[] {
  return Object.entries(flags)
    .filter(([key, value]) => value === true && !meta.flags[key]?.internal)
    .map(([key]) => key);
}
