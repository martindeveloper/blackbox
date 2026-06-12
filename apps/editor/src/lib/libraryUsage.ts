import type { LoadedBundle } from "./scenarioLoader.js";
import { collectSnippetIdsFromText, snippetIdFromTextEntry } from "./libraryRefs.js";
import { Page } from "./pages.js";

export type LibraryEntryKind = "snippet" | "template" | "condition";

export type LibraryUsageContext = "text" | "extends" | "templateText";

export interface LibraryUsage {
  context: LibraryUsageContext;
  chapterId?: string;
  nodeId: string;
  textIndex?: number;
}

export type LibraryUsageIndex = Map<string, LibraryUsage[]>;

export type LibraryNavigateTarget = {
  to: Page.EditorGraph | Page.EditorLibrary;
  search: Record<string, string | null | undefined>;
};

export function libraryUsageKey(kind: LibraryEntryKind, id: string): string {
  return `${kind}:${id}`;
}

function pushUsage(
  index: LibraryUsageIndex,
  kind: LibraryEntryKind,
  id: string,
  usage: LibraryUsage,
): void {
  const key = libraryUsageKey(kind, id);
  const list = index.get(key);
  if (list) list.push(usage);
  else index.set(key, [usage]);
}

function indexText(
  index: LibraryUsageIndex,
  text: unknown[] | undefined,
  base: Omit<LibraryUsage, "context" | "textIndex">,
  context: LibraryUsageContext,
): void {
  for (const [textIndex, entry] of (text ?? []).entries()) {
    const snippetId = snippetIdFromTextEntry(entry);
    if (!snippetId) continue;
    pushUsage(index, "snippet", snippetId, { context, ...base, textIndex });
  }
}

function indexNode(
  index: LibraryUsageIndex,
  node: { $extends?: string; text?: unknown[] },
  chapterId: string | undefined,
  nodeId: string,
): void {
  const base = { chapterId, nodeId };
  if (node.$extends) {
    pushUsage(index, "template", node.$extends, { context: "extends", ...base });
  }
  indexText(index, node.text, base, "text");
}

export function buildLibraryUsageIndex(bundle: LoadedBundle): LibraryUsageIndex {
  const index: LibraryUsageIndex = new Map();

  if (bundle.library) {
    for (const [templateId, template] of Object.entries(bundle.library.templates)) {
      indexText(index, template.text, { nodeId: templateId }, "templateText");
      if (template.$extends) {
        pushUsage(index, "template", template.$extends, {
          context: "extends",
          nodeId: templateId,
        });
      }
    }
  }

  for (const [chapterId, chapter] of Object.entries(bundle.chapters)) {
    for (const [nodeId, node] of Object.entries(chapter.nodes)) {
      indexNode(index, node, chapterId, nodeId);
    }
  }

  if (bundle.scenario.deathNode) {
    indexNode(index, bundle.scenario.deathNode, undefined, "deathNode");
  }

  return index;
}

export function getLibraryUsages(
  index: LibraryUsageIndex,
  kind: LibraryEntryKind,
  id: string,
): LibraryUsage[] {
  return index.get(libraryUsageKey(kind, id)) ?? [];
}

export function libraryUsageNavigateTarget(usage: LibraryUsage): LibraryNavigateTarget {
  if (usage.context === "templateText" || (usage.context === "extends" && !usage.chapterId)) {
    return {
      to: Page.EditorLibrary,
      search: {
        libraryKind: "template",
        libraryEntry: usage.nodeId,
      },
    };
  }

  return {
    to: Page.EditorGraph,
    search: {
      chapter: usage.chapterId ?? null,
      node: usage.nodeId,
    },
  };
}

export function snippetUsageSummary(text: unknown[] | undefined): string[] {
  return collectSnippetIdsFromText(text);
}
