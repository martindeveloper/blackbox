// @engine/sdk/v1/keyboard - keyboard helpers (Blackbox engine API v1).
import * as keyboard from "@engine/lib/keyboard.js";
import { useNumberKeySelect as useNumberKeySelectInternal } from "@engine/hooks/useNumberKeySelect.js";

export function isEditableTarget(target: EventTarget | null): boolean {
  return keyboard.isEditableTarget(target);
}

export function matchesShortcut(event: KeyboardEvent, key: string): boolean {
  return keyboard.matchesShortcut(event, key);
}

export function useNumberKeySelect(
  count: number,
  onSelect: (index: number) => void,
  enabled: boolean,
): void {
  useNumberKeySelectInternal(count, onSelect, enabled);
}
