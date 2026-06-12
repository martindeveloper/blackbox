import { useEffect } from "react";
import { isEditableTarget } from "../lib/keyboard.js";

/** Maps number keys 1..count to `onSelect(index)` while `enabled`. */
export function useNumberKeySelect(
  count: number,
  onSelect: (index: number) => void,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;

    function handleKey(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= count) return;
      event.preventDefault();
      onSelect(index);
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [count, onSelect, enabled]);
}
