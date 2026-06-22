import type { TextBlock, TextEntry } from "@/types/wire.js";

export function snippetIdFromTextEntry(entry: unknown): string | null {
  if (typeof entry === "string") {
    return entry.startsWith("@") ? entry.slice(1) : null;
  }
  if (entry && typeof entry === "object") {
    const snippet = (entry as { $snippet?: unknown }).$snippet;
    if (typeof snippet === "string" && snippet.length > 0) {
      return snippet;
    }
  }
  return null;
}

export function isTextBlock(entry: unknown): entry is TextBlock {
  return Boolean(entry && typeof entry === "object" && "kind" in entry && "text" in entry);
}

export function normalizeTextEntries(text: unknown[] | undefined): TextEntry[] {
  return (text ?? []).filter(
    (entry) => isTextBlock(entry) || snippetIdFromTextEntry(entry) !== null,
  ) as TextEntry[];
}

export function collectSnippetIdsFromText(text: unknown[] | undefined): string[] {
  const ids: string[] = [];
  for (const entry of text ?? []) {
    const snippetId = snippetIdFromTextEntry(entry);
    if (snippetId) ids.push(snippetId);
  }
  return ids;
}

export function snippetRef(snippetId: string, params?: Record<string, string>): TextEntry {
  const id = snippetId.startsWith("@") ? snippetId.slice(1) : snippetId;
  if (params && Object.keys(params).length > 0) {
    return { $snippet: id, params };
  }
  return `@${id}`;
}

export function snippetParamsFromTextEntry(entry: unknown): Record<string, string> | undefined {
  if (entry && typeof entry === "object") {
    const params = (entry as { params?: unknown }).params;
    if (params && typeof params === "object" && !Array.isArray(params)) {
      return Object.fromEntries(
        Object.entries(params).filter(([, v]) => typeof v === "string") as [string, string][],
      );
    }
  }
  return undefined;
}

export function textEntryKey(entry: TextEntry, index: number): string {
  const snippetId = snippetIdFromTextEntry(entry);
  if (snippetId) return `snippet:${snippetId}:${index}`;
  if (isTextBlock(entry)) return `block:${entry.kind}:${index}`;
  return `entry:${index}`;
}
