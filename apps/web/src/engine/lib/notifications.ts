import type { GameView, UiNotification } from "../types/game.js";
import { activeIntelKeys, formatRefId } from "./format.js";
import { collectStatDeltas, hpDamageAmount, hpHealAmount } from "./stateChanges.js";

export interface StateNotificationOptions {
  statOrder?: readonly string[];
}

export function collectStateNotifications(
  previous: GameView,
  current: GameView,
  nextId: () => number,
  options: StateNotificationOptions = {},
): UiNotification[] {
  const notifications: UiNotification[] = [];
  const damage = hpDamageAmount(previous.player_stats, current.player_stats);
  const healing = hpHealAmount(previous.player_stats, current.player_stats);
  const currentHp = current.player_stats.hp;
  const maxHp = current.player_stats.max_hp;

  if (damage !== null && typeof currentHp === "number") {
    notifications.push({
      id: nextId(),
      category: "damage",
      amount: damage,
      hp: currentHp,
      ...(typeof maxHp === "number" ? { maxHp } : {}),
    });
  }
  if (healing !== null && typeof currentHp === "number") {
    notifications.push({
      id: nextId(),
      category: "healing",
      amount: healing,
      hp: currentHp,
      ...(typeof maxHp === "number" ? { maxHp } : {}),
    });
  }

  for (const delta of collectStatDeltas(
    previous.player_stats,
    current.player_stats,
    options.statOrder,
  )) {
    notifications.push({ id: nextId(), category: "stat", ...delta });
  }

  const previousIntel = new Set(activeIntelKeys(previous.flags, current.meta));
  const currentIntel = new Set(activeIntelKeys(current.flags, current.meta));
  for (const intelRef of new Set([...previousIntel, ...currentIntel])) {
    const wasActive = previousIntel.has(intelRef);
    const isActive = currentIntel.has(intelRef);
    if (wasActive === isActive) continue;
    notifications.push({
      id: nextId(),
      category: "intel",
      change: isActive ? "acquired" : "lost",
      intelRef,
      intelName: current.meta.flags[intelRef]?.title ?? formatRefId(intelRef),
    });
  }

  const previousItemNames = Object.fromEntries(
    previous.inventory_items.map((item) => [item.ref_id, item.name]),
  );
  const currentItemNames = Object.fromEntries(
    current.inventory_items.map((item) => [item.ref_id, item.name]),
  );
  const previousItemIcons = Object.fromEntries(
    previous.inventory_items.map((item) => [item.ref_id, item.icon]),
  );
  const currentItemIcons = Object.fromEntries(
    current.inventory_items.map((item) => [item.ref_id, item.icon]),
  );
  for (const itemRef of new Set([
    ...Object.keys(previous.inventory),
    ...Object.keys(current.inventory),
  ])) {
    const previousCount = previous.inventory[itemRef] ?? 0;
    const currentCount = current.inventory[itemRef] ?? 0;
    const amount = currentCount - previousCount;
    if (amount === 0) continue;
    notifications.push({
      id: nextId(),
      category: "item",
      change: amount > 0 ? "acquired" : "lost",
      itemRef,
      itemName: currentItemNames[itemRef] ?? previousItemNames[itemRef] ?? formatRefId(itemRef),
      amount: Math.abs(amount),
      count: currentCount,
      icon: currentItemIcons[itemRef] ?? previousItemIcons[itemRef],
    });
  }

  return notifications;
}
