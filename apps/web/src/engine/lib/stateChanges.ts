export interface StatDelta {
  stat: string;
  change: "gained" | "lost";
  amount: number;
  value: number;
}

export function hpDamageAmount(
  previous: Record<string, number>,
  current: Record<string, number>,
): number | null {
  const previousHp = previous.hp;
  const currentHp = current.hp;
  if (typeof previousHp !== "number" || typeof currentHp !== "number" || currentHp >= previousHp) {
    return null;
  }
  return previousHp - currentHp;
}

export function hpHealAmount(
  previous: Record<string, number>,
  current: Record<string, number>,
): number | null {
  const previousHp = previous.hp;
  const currentHp = current.hp;
  if (typeof previousHp !== "number" || typeof currentHp !== "number" || currentHp <= previousHp) {
    return null;
  }
  return currentHp - previousHp;
}

export function collectStatDeltas(
  previous: Record<string, number>,
  current: Record<string, number>,
  preferredOrder: readonly string[] = [],
): StatDelta[] {
  const stats = new Set([...Object.keys(previous), ...Object.keys(current)]);
  const deltas: StatDelta[] = [];

  for (const stat of stats) {
    if (stat === "hp" || stat === "max_hp") continue;
    const previousValue = previous[stat];
    const currentValue = current[stat];
    if (
      typeof previousValue !== "number" ||
      typeof currentValue !== "number" ||
      currentValue === previousValue
    ) {
      continue;
    }
    deltas.push({
      stat,
      change: currentValue > previousValue ? "gained" : "lost",
      amount: Math.abs(currentValue - previousValue),
      value: currentValue,
    });
  }

  deltas.sort((left, right) => {
    const leftIndex = preferredOrder.indexOf(left.stat);
    const rightIndex = preferredOrder.indexOf(right.stat);
    if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
    if (leftIndex !== -1) return -1;
    if (rightIndex !== -1) return 1;
    return left.stat.localeCompare(right.stat);
  });
  return deltas;
}

export function mergeDisplayStats(
  authoritative: Record<string, number>,
  baseline: Record<string, number>,
  freezeHp: boolean,
): Record<string, number> {
  if (!freezeHp || typeof baseline.hp !== "number") return authoritative;
  return { ...authoritative, hp: baseline.hp };
}
