import type { JsonValue } from "@/types/wire.js";

export type FlagValuePreset = "unset" | "true" | "false" | "custom";

export function flagValuePreset(value: JsonValue | undefined): FlagValuePreset {
  if (value === true) return "true";
  if (value === false) return "false";
  if (value === undefined) return "unset";
  return "custom";
}

export function flagValueFromPreset(preset: FlagValuePreset): JsonValue | undefined {
  if (preset === "true") return true;
  if (preset === "false") return false;
  if (preset === "unset") return undefined;
  return "";
}

export function flagValueToCustomString(value: JsonValue | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function parseCustomFlagValue(raw: string): JsonValue | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[")
  ) {
    try {
      return JSON.parse(trimmed) as JsonValue;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}
