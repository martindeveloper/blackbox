import type { ChoiceContent, TextBlock } from "@/types/wire.js";

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
    block.side ||
    block.actor ||
    block.when ||
    block.unless ||
    (block.kind !== "dialogue" && block.speaker),
  );
}
