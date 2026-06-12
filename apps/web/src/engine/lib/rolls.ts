import type { RollRecord } from "../types/game.js";
import { engineText } from "./localization.js";

export function rollStatusSummary(rolls: RollRecord[]): string {
  const separator = engineText("rolls.summarySeparator");
  return rolls
    .map((roll) => {
      if (roll.kind === "skillCheck") {
        return roll.success ? engineText("rolls.checkPassed") : engineText("rolls.checkFailed");
      }
      return engineText("rolls.summaryGeneric", {
        kind: roll.kind.toUpperCase(),
        total: roll.total,
      });
    })
    .join(separator);
}

export function rollStatusFailed(rolls: RollRecord[]): boolean {
  return rolls.some((roll) => roll.kind === "skillCheck" && !roll.success);
}
