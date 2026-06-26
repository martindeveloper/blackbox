// @engine/sdk/v1/state/save-load - save-slot API (Blackbox engine API v1).
import * as slots from "@engine/lib/slots.js";

export type SlotData = slots.SlotData;
export type ChapterCheckpoint = slots.ChapterCheckpoint;

export function getSlotCount(): number {
  return slots.getSlotCount();
}

export function readSlot(index: number): SlotData | null {
  return slots.readSlot(index);
}

export function readAllSlots(): (SlotData | null)[] {
  return slots.readAllSlots();
}

export function readLastUsedSlot(): number | null {
  return slots.readLastUsedSlot();
}

export function persistLastUsedSlot(index: number | null): void {
  slots.persistLastUsedSlot(index);
}

export function clearSlot(index: number): void {
  slots.clearSlot(index);
}

export function clearAllPlayerData(): void {
  slots.clearAllPlayerData();
}
