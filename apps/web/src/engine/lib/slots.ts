import { parseSavePreview } from "./savePreview.js";

export const SLOT_COUNT = 3;

export interface SlotData {
  state: string;
  savedAt: string;
  totalPlaytimeMs: number;
  nodeId: string | null;
  chapterId: string | null;
  location: string | null;
  randomSeed: string | null;
  chapterCheckpoint: ChapterCheckpoint | null;
}

export interface ChapterCheckpoint {
  state: string;
  savedAt: string;
  chapterId: string | null;
  location: string | null;
}

function slotStorageKey(index: number): string {
  return `blackbox_save_slot_${index}`;
}

function normalizedPlaytime(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function readSlot(index: number): SlotData | null {
  try {
    const raw = localStorage.getItem(slotStorageKey(index));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SlotData>;
    if (typeof parsed.state !== "string" || typeof parsed.savedAt !== "string") return null;
    const checkpoint = parsed.chapterCheckpoint as Partial<ChapterCheckpoint> | null | undefined;
    return {
      state: parsed.state,
      savedAt: parsed.savedAt,
      totalPlaytimeMs: normalizedPlaytime(parsed.totalPlaytimeMs),
      nodeId: typeof parsed.nodeId === "string" ? parsed.nodeId : null,
      chapterId: typeof parsed.chapterId === "string" ? parsed.chapterId : null,
      location: typeof parsed.location === "string" ? parsed.location : null,
      randomSeed: typeof parsed.randomSeed === "string" ? parsed.randomSeed : null,
      chapterCheckpoint:
        checkpoint && typeof checkpoint.state === "string" && typeof checkpoint.savedAt === "string"
          ? {
              state: checkpoint.state,
              savedAt: checkpoint.savedAt,
              chapterId: typeof checkpoint.chapterId === "string" ? checkpoint.chapterId : null,
              location: typeof checkpoint.location === "string" ? checkpoint.location : null,
            }
          : null,
    };
  } catch {
    return null;
  }
}

export function writeSlot(
  index: number,
  state: string,
  chapterId: string | null = null,
  location: string | null = null,
  playtimeDeltaMs = 0,
): void {
  try {
    const preview = parseSavePreview(state);
    const existing = readSlot(index);
    const data: SlotData = {
      state,
      savedAt: new Date().toISOString(),
      totalPlaytimeMs: (existing?.totalPlaytimeMs ?? 0) + normalizedPlaytime(playtimeDeltaMs),
      nodeId: preview?.nodeId ?? null,
      chapterId,
      location,
      randomSeed: preview?.randomSeed ?? null,
      chapterCheckpoint: existing?.chapterCheckpoint ?? null,
    };
    localStorage.setItem(slotStorageKey(index), JSON.stringify(data));
  } catch {}
}

export function writeChapterCheckpoint(
  index: number,
  state: string,
  chapterId: string | null,
  location: string | null,
  playtimeDeltaMs = 0,
): void {
  try {
    const preview = parseSavePreview(state);
    const savedAt = new Date().toISOString();
    const existing = readSlot(index);
    const data: SlotData = {
      state,
      savedAt,
      totalPlaytimeMs: (existing?.totalPlaytimeMs ?? 0) + normalizedPlaytime(playtimeDeltaMs),
      nodeId: preview?.nodeId ?? null,
      chapterId,
      location,
      randomSeed: preview?.randomSeed ?? null,
      chapterCheckpoint: {
        state,
        savedAt,
        chapterId,
        location,
      },
    };
    localStorage.setItem(slotStorageKey(index), JSON.stringify(data));
  } catch {}
}

export function addSlotPlaytime(index: number, playtimeDeltaMs: number): void {
  try {
    const existing = readSlot(index);
    const delta = normalizedPlaytime(playtimeDeltaMs);
    if (!existing || delta === 0) return;
    localStorage.setItem(
      slotStorageKey(index),
      JSON.stringify({
        ...existing,
        savedAt: new Date().toISOString(),
        totalPlaytimeMs: existing.totalPlaytimeMs + delta,
      } satisfies SlotData),
    );
  } catch {}
}

export function clearSlot(index: number): void {
  try {
    localStorage.removeItem(slotStorageKey(index));
  } catch {}
}

const PLAYER_DATA_PREFIX = "blackbox_";

export function clearAllPlayerData(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PLAYER_DATA_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {}
}

export function readAllSlots(): (SlotData | null)[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => readSlot(i));
}
