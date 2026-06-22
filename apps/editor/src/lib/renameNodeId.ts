import type { Gate } from "@/types/wire.js";
import type { LoadedBundle } from "./scenarioLoader.js";
import { isTextBlock } from "./libraryRefs.js";

function replaceGateNodeRefs(gate: Gate, oldId: string, newId: string): Gate {
  if (Array.isArray(gate)) {
    return gate.map((g) => replaceGateNodeRefs(g, oldId, newId));
  }
  if (gate.type === "visited" || gate.type === "atNode") {
    if (gate.nodeId === oldId) return { ...gate, nodeId: newId };
    return gate;
  }
  if (gate.type === "all" || gate.type === "any") {
    return {
      ...gate,
      conditions: gate.conditions.map((c) => replaceGateNodeRefs(c, oldId, newId)),
    };
  }
  if (gate.type === "not") {
    return { ...gate, condition: replaceGateNodeRefs(gate.condition, oldId, newId) };
  }
  return gate;
}

export function renameNodeId(
  bundle: LoadedBundle,
  chapterId: string,
  oldId: string,
  newId: string,
): void {
  if (oldId === newId) return;

  const chapter = bundle.chapters[chapterId];
  if (!chapter) return;

  const node = chapter.nodes[oldId];
  if (!node) return;

  delete chapter.nodes[oldId];
  node.id = newId;
  chapter.nodes[newId] = node;

  if (chapter.startNodeId === oldId) chapter.startNodeId = newId;
  if (chapter.deathNodeId === oldId) chapter.deathNodeId = newId;

  const layout = bundle.layout.chapters[chapterId]?.nodes;
  if (layout?.[oldId]) {
    layout[newId] = layout[oldId];
    delete layout[oldId];
  }

  for (const ch of Object.values(bundle.chapters)) {
    for (const n of Object.values(ch.nodes)) {
      for (const choice of n.choices ?? []) {
        if (choice.goto === oldId) choice.goto = newId;
        if (choice.check?.onSuccess.goto === oldId) choice.check.onSuccess.goto = newId;
        if (choice.check?.onFailure.goto === oldId) choice.check.onFailure.goto = newId;
        if (choice.when) choice.when = replaceGateNodeRefs(choice.when, oldId, newId);
        if (choice.unless) choice.unless = replaceGateNodeRefs(choice.unless, oldId, newId);
        if (choice.requires) {
          choice.requires = replaceGateNodeRefs(choice.requires, oldId, newId);
        }
        if (choice.action?.type === "restartGame" && choice.action.startNodeId === oldId) {
          choice.action.startNodeId = newId;
        }
      }
      for (const block of n.text ?? []) {
        if (!isTextBlock(block)) continue;
        if (block.when) block.when = replaceGateNodeRefs(block.when, oldId, newId);
        if (block.unless) block.unless = replaceGateNodeRefs(block.unless, oldId, newId);
      }
    }
  }

  for (const item of Object.values(bundle.items.items)) {
    for (const action of item.actions ?? []) {
      if (action.goto === oldId) action.goto = newId;
      if (action.when) action.when = replaceGateNodeRefs(action.when, oldId, newId);
      if (action.unless) action.unless = replaceGateNodeRefs(action.unless, oldId, newId);
      if (action.requires) {
        action.requires = replaceGateNodeRefs(action.requires, oldId, newId);
      }
    }
  }
}
