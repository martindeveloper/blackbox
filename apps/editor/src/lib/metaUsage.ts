import type { LoadedBundle } from "./scenarioLoader.js";
import type { Effect, Gate } from "@/types/wire.js";
import { Page } from "./pages.js";
import { isTextBlock } from "./libraryRefs.js";

export type MetaEntryKind = "event" | "flag";

export type MetaUsageContext =
  | "onEnter"
  | "text"
  | "requires"
  | "gate"
  | "choice"
  | "choiceSuccess"
  | "choiceFailure"
  | "itemAction";

export type MetaUsageEffectKind = "addEvent" | "setFlag" | "hasFlag" | "storeFlag";

export interface MetaUsage {
  effectKind: MetaUsageEffectKind;
  context: MetaUsageContext;
  chapterId?: string;
  nodeId?: string;
  choiceId?: string;
  itemId?: string;
  actionId?: string;
}

export type MetaUsageIndex = Map<string, MetaUsage[]>;

export type MetaNavigateTarget = {
  to: Page.EditorGraph | Page.EditorItems;
  search: Record<string, string>;
};

export function metaUsageKey(kind: MetaEntryKind, id: string): string {
  return `${kind}:${id}`;
}

function pushMeta(index: MetaUsageIndex, kind: MetaEntryKind, id: string, usage: MetaUsage): void {
  const key = metaUsageKey(kind, id);
  const list = index.get(key);
  if (list) list.push(usage);
  else index.set(key, [usage]);
}

function indexEffects(
  index: MetaUsageIndex,
  effects: Effect[] | undefined,
  base: Omit<MetaUsage, "effectKind">,
): void {
  for (const effect of effects ?? []) {
    if (effect.type === "addEvent") {
      pushMeta(index, "event", effect.eventId, { effectKind: "addEvent", ...base });
    } else if (effect.type === "setFlag") {
      pushMeta(index, "flag", effect.flag, { effectKind: "setFlag", ...base });
    } else if (effect.type === "roll" && effect.storeFlag) {
      pushMeta(index, "flag", effect.storeFlag, { effectKind: "storeFlag", ...base });
    }
  }
}

function indexGate(
  index: MetaUsageIndex,
  gate: Gate | undefined,
  base: Omit<MetaUsage, "effectKind">,
): void {
  if (!gate) return;
  if (Array.isArray(gate)) {
    for (const g of gate) indexGate(index, g, base);
    return;
  }
  if (gate.type === "hasFlag") {
    pushMeta(index, "flag", gate.flag, { effectKind: "hasFlag", ...base });
  } else if ("conditions" in gate) {
    for (const c of gate.conditions) indexGate(index, c, base);
  } else if ("condition" in gate) {
    indexGate(index, gate.condition, base);
  }
}

export function buildMetaUsageIndex(bundle: LoadedBundle): MetaUsageIndex {
  const index: MetaUsageIndex = new Map();

  for (const [chapterId, chapter] of Object.entries(bundle.chapters)) {
    for (const [nodeId, node] of Object.entries(chapter.nodes)) {
      const nodeBase = { chapterId, nodeId };

      indexEffects(index, node.onEnter, { ...nodeBase, context: "onEnter" });

      for (const block of node.text ?? []) {
        if (!isTextBlock(block)) continue;
        indexGate(index, block.when, { ...nodeBase, context: "text" });
        indexGate(index, block.unless, { ...nodeBase, context: "text" });
      }

      for (const choice of node.choices ?? []) {
        const choiceBase = { ...nodeBase, choiceId: choice.id };
        indexGate(index, choice.requires, { ...choiceBase, context: "requires" });
        indexGate(index, choice.when, { ...choiceBase, context: "gate" });
        indexGate(index, choice.unless, { ...choiceBase, context: "gate" });
        indexEffects(index, choice.effects, { ...choiceBase, context: "choice" });
        if (choice.check) {
          indexEffects(index, choice.check.onSuccess.effects, {
            ...choiceBase,
            context: "choiceSuccess",
          });
          indexEffects(index, choice.check.onFailure.effects, {
            ...choiceBase,
            context: "choiceFailure",
          });
        }
      }
    }
  }

  for (const [itemId, item] of Object.entries(bundle.items.items)) {
    for (const action of item.actions ?? []) {
      const actionBase = { itemId, actionId: action.id, context: "itemAction" as const };
      indexGate(index, action.requires, actionBase);
      indexGate(index, action.when, actionBase);
      indexGate(index, action.unless, actionBase);
      indexEffects(index, action.effects, actionBase);
    }
  }

  return index;
}

export function getMetaUsages(index: MetaUsageIndex, kind: MetaEntryKind, id: string): MetaUsage[] {
  return index.get(metaUsageKey(kind, id)) ?? [];
}

export function metaUsageNavigateTarget(usage: MetaUsage): MetaNavigateTarget | null {
  if (usage.chapterId && usage.nodeId) {
    return {
      to: Page.EditorGraph,
      search: { chapter: usage.chapterId, node: usage.nodeId },
    };
  }
  if (usage.itemId) {
    return { to: Page.EditorItems, search: { item: usage.itemId } };
  }
  return null;
}
