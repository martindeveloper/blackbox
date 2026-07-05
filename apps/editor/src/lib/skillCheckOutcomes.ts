import type { SkillCheckContent, SkillCheckOutcome, SkillCheckTier } from "@/types/wire.js";

export type CheckOutcomeContext = "onSuccess" | "onFailure" | "onExhausted" | "tier";

export interface CheckOutcomeBranch {
  context: CheckOutcomeContext;
  outcome: SkillCheckOutcome | SkillCheckTier;
}

/**
 * Every resolution branch a check can produce a result through: the binary
 * onSuccess/onFailure/onExhausted outcomes, and for tiered checks, each outcome band.
 * Scanners and rewriters that don't care which form authored the check use this instead
 * of reaching into the mutually-exclusive fields directly.
 */
export function checkOutcomeBranches(check: SkillCheckContent): CheckOutcomeBranch[] {
  const branches: CheckOutcomeBranch[] = [];
  if (check.onSuccess) branches.push({ context: "onSuccess", outcome: check.onSuccess });
  if (check.onFailure) branches.push({ context: "onFailure", outcome: check.onFailure });
  if (check.onExhausted) branches.push({ context: "onExhausted", outcome: check.onExhausted });
  for (const tier of check.outcomes ?? []) branches.push({ context: "tier", outcome: tier });
  return branches;
}
