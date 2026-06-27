import type { ChoiceView, ItemActionView } from "./types.js";
import * as choices from "@engine/lib/choices.js";

export type ChoiceActionHandlers = choices.ChoiceActionHandlers;

export const REQUIRES_FLAG_REASON_PREFIX = choices.REQUIRES_FLAG_REASON_PREFIX;

export function dispatchChoice(choice: ChoiceView, handlers: ChoiceActionHandlers): void {
  choices.dispatchChoice(choice, handlers);
}

export function isFlagGatedDisabledChoice(choice: ChoiceView): boolean {
  return choices.isFlagGatedDisabledChoice(choice);
}

export function playerVisibleChoices(list: ChoiceView[]): ChoiceView[] {
  return choices.playerVisibleChoices(list);
}

export function actionsByItem(actions: ItemActionView[]): Map<string, ItemActionView[]> {
  return choices.actionsByItem(actions);
}
