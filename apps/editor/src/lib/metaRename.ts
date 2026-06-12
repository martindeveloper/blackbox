import type { LoadedBundle } from "./scenarioLoader.js";
import type { MetaEntryKind } from "./metaUsage.js";
import type { Effect, Gate } from "../types/wire.js";
import { isTextBlock } from "./libraryRefs.js";

const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

export interface MetaRenameResult {
  ok: boolean;
  reason?: "collision" | "invalid" | "empty" | "missing";
  dirtyKeys?: string[];
}

function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

function renameInEffects(
  effects: Effect[] | undefined,
  kind: MetaEntryKind,
  oldId: string,
  newId: string,
): boolean {
  let changed = false;
  for (const effect of effects ?? []) {
    if (kind === "event" && effect.type === "addEvent" && effect.eventId === oldId) {
      (effect as { type: "addEvent"; eventId: string }).eventId = newId;
      changed = true;
    } else if (kind === "flag" && effect.type === "setFlag" && effect.flag === oldId) {
      (effect as { type: "setFlag"; flag: string }).flag = newId;
      changed = true;
    } else if (kind === "flag" && effect.type === "roll" && effect.storeFlag === oldId) {
      (effect as { type: "roll"; storeFlag?: string }).storeFlag = newId;
      changed = true;
    }
  }
  return changed;
}

function renameInGate(gate: Gate | undefined, oldId: string, newId: string): boolean {
  if (!gate) return false;
  if (Array.isArray(gate)) {
    let changed = false;
    for (const g of gate) {
      if (renameInGate(g, oldId, newId)) changed = true;
    }
    return changed;
  }
  if (gate.type === "hasFlag" && gate.flag === oldId) {
    (gate as { type: "hasFlag"; flag: string }).flag = newId;
    return true;
  }
  if ("conditions" in gate) {
    let changed = false;
    for (const c of gate.conditions) {
      if (renameInGate(c, oldId, newId)) changed = true;
    }
    return changed;
  }
  if ("condition" in gate) {
    return renameInGate(gate.condition, oldId, newId);
  }
  return false;
}

export function renameMetaEntry(
  bundle: LoadedBundle,
  kind: MetaEntryKind,
  oldId: string,
  requestedId: string,
): MetaRenameResult {
  const newId = requestedId.trim();
  if (!newId) return { ok: false, reason: "empty" };
  if (!isValidId(newId)) return { ok: false, reason: "invalid" };
  if (newId === oldId) return { ok: true, dirtyKeys: [] };

  if (!bundle.meta) return { ok: false, reason: "missing" };

  const catalog = kind === "event" ? bundle.meta.events : bundle.meta.flags;
  if (!catalog[oldId]) return { ok: false, reason: "missing" };
  if (catalog[newId]) return { ok: false, reason: "collision" };

  const dirtyKeys: string[] = ["meta"];

  catalog[newId] = catalog[oldId]!;
  delete catalog[oldId];

  for (const [chapterId, chapter] of Object.entries(bundle.chapters)) {
    let chapterDirty = false;
    for (const node of Object.values(chapter.nodes)) {
      if (renameInEffects(node.onEnter, kind, oldId, newId)) chapterDirty = true;
      for (const block of node.text ?? []) {
        if (kind === "flag" && isTextBlock(block)) {
          if (renameInGate(block.when, oldId, newId)) chapterDirty = true;
          if (renameInGate(block.unless, oldId, newId)) chapterDirty = true;
        }
      }
      for (const choice of node.choices ?? []) {
        if (kind === "flag") {
          if (renameInGate(choice.requires, oldId, newId)) chapterDirty = true;
          if (renameInGate(choice.when, oldId, newId)) chapterDirty = true;
          if (renameInGate(choice.unless, oldId, newId)) chapterDirty = true;
        }
        if (renameInEffects(choice.effects, kind, oldId, newId)) chapterDirty = true;
        if (choice.check) {
          if (renameInEffects(choice.check.onSuccess.effects, kind, oldId, newId))
            chapterDirty = true;
          if (renameInEffects(choice.check.onFailure.effects, kind, oldId, newId))
            chapterDirty = true;
        }
      }
    }
    if (chapterDirty) dirtyKeys.push(`chapter:${chapterId}`);
  }

  let itemsDirty = false;
  for (const item of Object.values(bundle.items.items)) {
    for (const action of item.actions ?? []) {
      if (kind === "flag") {
        if (renameInGate(action.requires, oldId, newId)) itemsDirty = true;
        if (renameInGate(action.when, oldId, newId)) itemsDirty = true;
        if (renameInGate(action.unless, oldId, newId)) itemsDirty = true;
      }
      if (renameInEffects(action.effects, kind, oldId, newId)) itemsDirty = true;
    }
  }
  if (itemsDirty) dirtyKeys.push("items");

  return { ok: true, dirtyKeys };
}
