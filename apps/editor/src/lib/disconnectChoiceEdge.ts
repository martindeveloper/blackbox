import type { GraphEdgeKind } from "./graphBuilder.js";
import { checkOutcomeBranches } from "./skillCheckOutcomes.js";
import type { Chapter, ChoiceContent, ItemCatalog } from "@/types/wire.js";

function choiceHasRoute(choice: ChoiceContent): boolean {
  if (choice.goto) return true;
  if (choice.check && checkOutcomeBranches(choice.check).some((branch) => branch.outcome.goto)) {
    return true;
  }
  if (choice.action) return true;
  return false;
}

function clearChoiceRoute(choice: ChoiceContent, kind: GraphEdgeKind): ChoiceContent {
  switch (kind) {
    case "goto":
      return { ...choice, goto: undefined };
    case "checkSuccess":
      if (!choice.check?.onSuccess) return choice;
      return {
        ...choice,
        check: {
          ...choice.check,
          onSuccess: { ...choice.check.onSuccess, goto: undefined },
        },
      };
    case "checkFailure":
      if (!choice.check?.onFailure) return choice;
      return {
        ...choice,
        check: {
          ...choice.check,
          onFailure: { ...choice.check.onFailure, goto: undefined },
        },
      };
    case "checkExhausted":
      if (!choice.check?.onExhausted) return choice;
      return {
        ...choice,
        check: {
          ...choice.check,
          onExhausted: { ...choice.check.onExhausted, goto: undefined },
        },
      };
    case "gotoChapter":
      return { ...choice, action: undefined };
    default:
      return choice;
  }
}

function disconnectItemActionEdge(items: ItemCatalog, actionId: string): boolean {
  for (const item of Object.values(items.items)) {
    if (!item.actions) continue;
    const action = item.actions.find((candidate) => candidate.id === actionId);
    if (action?.goto) {
      action.goto = undefined;
      return true;
    }
  }
  return false;
}

function disconnectRedirectEdge(chapter: Chapter, sourceId: string, ruleIndex: string): boolean {
  const node = chapter.nodes[sourceId];
  const index = Number(ruleIndex);
  if (!node?.redirect || !Number.isInteger(index) || index < 0 || index >= node.redirect.length) {
    return false;
  }
  node.redirect = node.redirect.filter((_, i) => i !== index);
  if (node.redirect.length === 0) delete node.redirect;
  return true;
}

export function disconnectChoiceEdgeInBundle(
  chapter: Chapter,
  items: ItemCatalog,
  sourceId: string,
  choiceId: string,
  kind: GraphEdgeKind,
): { chapterDirty: boolean; itemsDirty: boolean } {
  if (kind === "itemAction") {
    return { chapterDirty: false, itemsDirty: disconnectItemActionEdge(items, choiceId) };
  }

  if (kind === "redirect") {
    return { chapterDirty: disconnectRedirectEdge(chapter, sourceId, choiceId), itemsDirty: false };
  }

  const source = chapter.nodes[sourceId];
  if (!source?.choices) return { chapterDirty: false, itemsDirty: false };

  const index = source.choices.findIndex((choice) => choice.id === choiceId);
  if (index < 0) return { chapterDirty: false, itemsDirty: false };

  const updated = clearChoiceRoute(source.choices[index]!, kind);
  if (!choiceHasRoute(updated)) {
    source.choices = source.choices.filter((choice) => choice.id !== choiceId);
    if (source.choices.length === 0) delete source.choices;
  } else {
    source.choices[index] = updated;
  }

  return { chapterDirty: true, itemsDirty: false };
}
