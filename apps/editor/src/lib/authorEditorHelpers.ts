import type { ChoiceContent, TextBlock } from "@/types/wire.js";
import { useState } from "react";

export function choiceHasAdvancedFields(choice: ChoiceContent): boolean {
  return Boolean(
    choice.sfx ||
    choice.disabledReason ||
    choice.whenDisabledReason ||
    choice.unlessDisabledReason ||
    choice.requires ||
    choice.when ||
    choice.unless,
  );
}

export function textBlockHasDirection(block: TextBlock): boolean {
  return Boolean(
    block.else ||
    block.emotion ||
    (block.style?.length ?? 0) > 0 ||
    block.side ||
    block.actor ||
    block.when ||
    block.unless ||
    (block.kind !== "dialogue" && block.speaker),
  );
}

/** Keep an author panel open while editing; auto-expand when content appears. */
export function useAuthorPanelOpen(configured: boolean): {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} {
  const [open, setOpen] = useState(configured);
  const [prevConfigured, setPrevConfigured] = useState(configured);

  if (configured !== prevConfigured) {
    setPrevConfigured(configured);
    if (configured) setOpen(true);
  }

  return { open, onOpenChange: setOpen };
}
