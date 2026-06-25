import type { ChoiceView, ItemActionView } from "../types/game.js";

export interface ChoiceActionHandlers {
  onChoose: (choiceId: string) => void;
  onRestart: () => void;
  onOpenLoad: () => void;
  onOpenMainMenu: () => void;
}

export function dispatchChoice(choice: ChoiceView, handlers: ChoiceActionHandlers): void {
  if (choice.action?.type === "openLoadMenu") handlers.onOpenLoad();
  else if (choice.action?.type === "openMainMenu") handlers.onOpenMainMenu();
  else if (choice.action?.type === "restartGame") handlers.onRestart();
  else handlers.onChoose(choice.id);
}

export const REQUIRES_FLAG_REASON_PREFIX = "Requires flag:" as const;

export function isFlagGatedDisabledChoice(choice: ChoiceView): boolean {
  return (
    !choice.enabled && (choice.disabledReason?.startsWith(REQUIRES_FLAG_REASON_PREFIX) ?? false)
  );
}

export function playerVisibleChoices(choices: ChoiceView[]): ChoiceView[] {
  return choices.filter((choice) => !isFlagGatedDisabledChoice(choice));
}

export function actionsByItem(actions: ItemActionView[]): Map<string, ItemActionView[]> {
  const result = new Map<string, ItemActionView[]>();
  for (const action of actions) {
    const entries = result.get(action.item_ref) ?? [];
    entries.push(action);
    result.set(action.item_ref, entries);
  }
  return result;
}
