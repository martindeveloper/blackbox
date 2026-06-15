import type { GraphEdgeKind } from "./graphBuilder.js";
import type { Chapter, ChoiceContent, ItemCatalog } from "../types/wire.js";

function choiceHasRoute(choice: ChoiceContent): boolean {
  if (choice.goto) return true;
  if (choice.check?.onSuccess.goto) return true;
  if (choice.check?.onFailure.goto) return true;
  if (choice.check?.onExhausted?.goto) return true;
  if (choice.action) return true;
  return false;
}

function clearChoiceRoute(choice: ChoiceContent, kind: GraphEdgeKind): ChoiceContent {
  switch (kind) {
    case "goto":
      return { ...choice, goto: undefined };
    case "checkSuccess":
      if (!choice.check) return choice;
      return {
        ...choice,
        check: {
          ...choice.check,
          onSuccess: { ...choice.check.onSuccess, goto: undefined },
        },
      };
    case "checkFailure":
      if (!choice.check) return choice;
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

/** Remove the graph edge's backing choice route from chapter/item data. */
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
