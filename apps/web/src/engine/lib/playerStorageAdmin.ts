import { clearPlayerStorage, playerStorageKey } from "./playerConfig.js";

function storageEntryValue(key: string, value: unknown): string {
  if (key.startsWith("save-slot:")) {
    const slot =
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? ({ ...(value as Record<string, unknown>) } as Record<string, unknown>)
        : null;
    if (!slot) throw new Error(`Invalid save slot: ${key}`);
    if (slot.state !== null && typeof slot.state === "object") {
      slot.state = JSON.stringify(slot.state);
    }
    return JSON.stringify(slot);
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

function parseStoredValue(key: string, raw: string): unknown {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      key.startsWith("save-slot:") &&
      parsed &&
      typeof parsed === "object" &&
      "state" in parsed &&
      typeof (parsed as { state?: unknown }).state === "string"
    ) {
      const slot = parsed as { state: string } & Record<string, unknown>;
      return { ...slot, state: JSON.parse(slot.state) as unknown };
    }
    return parsed;
  } catch {
    return raw;
  }
}

/** Parsed player storage keyed by short names (`save-slot:0`, `last-used-slot`, …). */
export function readPlayerStorageSnapshot(): Record<string, unknown> {
  const prefix = playerStorageKey("");
  const result: Record<string, unknown> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const fullKey = localStorage.key(index);
    if (!fullKey?.startsWith(prefix)) continue;
    const key = fullKey.slice(prefix.length);
    const raw = localStorage.getItem(fullKey);
    if (raw === null) continue;
    result[key] = parseStoredValue(key, raw);
  }
  return result;
}

export function importPlayerStorageSnapshot(state: Record<string, unknown>): void {
  const prefix = playerStorageKey("");
  const incoming = Object.entries(state).map(
    ([key, value]) => [`${prefix}${key}`, storageEntryValue(key, value)] as const,
  );
  const previous = Object.keys(localStorage)
    .filter((key) => key.startsWith(prefix))
    .map((key) => [key, localStorage.getItem(key)!] as const);

  const replace = (entries: readonly (readonly [string, string])[]) => {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => localStorage.removeItem(key));
    entries.forEach(([key, value]) => localStorage.setItem(key, value));
  };

  try {
    replace(incoming);
  } catch (error) {
    try {
      replace(previous);
    } catch {}
    throw error;
  }
}

export function clearPlayerSaveSlots(): void {
  const prefix = playerStorageKey("");
  Object.keys(localStorage)
    .filter((key) => {
      if (!key.startsWith(prefix)) return false;
      const shortKey = key.slice(prefix.length);
      return shortKey.startsWith("save-slot:") || shortKey === "last-used-slot";
    })
    .forEach((key) => localStorage.removeItem(key));
}

export { clearPlayerStorage as clearAllPlayerStorage };
