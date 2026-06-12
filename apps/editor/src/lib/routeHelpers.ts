import { useSearch, useRouterState } from "@tanstack/react-router";
import type { NavigateOptions } from "@tanstack/react-router";
import type { CatalogCategory } from "./catalogUsage.js";
import type { MetaEntryKind } from "./metaUsage.js";
import type { LibraryEntryKind } from "./libraryUsage.js";
import { parseMediaCategory } from "./mediaLibrary.js";
import type { MediaCategory } from "./mediaLibrary.js";
import { cleanSearch, editorNavigate } from "./projectRoute.js";
import { ACTIVITY_PAGES, Page, type ActivityView } from "./pages.js";

export type { ActivityView } from "./pages.js";

export type ToolId = "linter" | "bundle" | "simulator";

export const DEFAULT_MEDIA_SEARCH = {
  category: "textures" as const,
};

function activityFromPath(pathname: string): ActivityView | null {
  const seg = pathname.split("/")[3];
  if (!seg) return null;
  const valid = Object.keys(ACTIVITY_PAGES) as ActivityView[];
  return valid.includes(seg as ActivityView) ? (seg as ActivityView) : null;
}

export function useEditorSearch() {
  const raw = useSearch({ strict: false }) as Record<string, string | undefined>;
  return {
    category: parseMediaCategory(raw.category),
    folder: raw.folder ?? null,
    file: raw.file ?? null,
    chapter: raw.chapter ?? null,
    node: raw.node ?? null,
    globalNode: raw.globalNode ?? null,
    item: raw.item ?? null,
    character: raw.character ?? null,
    characterFilter: raw.filter ?? "",
    key: raw.key ?? null,
    tool: parseToolId(raw.tool),
    run: parseRunFlag(raw.run),
    metaKind: parseMetaKind(raw.metaKind),
    metaEntry: raw.metaEntry ?? null,
    libraryKind: parseLibraryKind(raw.libraryKind),
    libraryEntry: raw.libraryEntry ?? null,
  };
}

function parseMetaKind(value: string | undefined): MetaEntryKind {
  return value === "flag" ? "flag" : "event";
}

function parseLibraryKind(value: string | undefined): LibraryEntryKind {
  if (value === "template") return "template";
  if (value === "condition") return "condition";
  return "snippet";
}

function parseToolId(value: string | undefined): ToolId | null {
  if (value === "linter" || value === "bundle" || value === "simulator") return value;
  return null;
}

function parseRunFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

export function navigateToTool(
  navigate: EditorNavigate,
  tool: ToolId,
  options?: { run?: boolean },
) {
  return editorNavigate(navigate, {
    to: Page.EditorTools,
    search: cleanSearch({
      tool,
      ...(options?.run ? { run: true as const } : {}),
    }),
  });
}

export function useActivityView(): ActivityView | null {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return activityFromPath(pathname);
}

type EditorNavigate = (options: NavigateOptions) => Promise<void>;

export function navigateToMedia(
  navigate: EditorNavigate,
  search: Partial<{
    category: MediaCategory;
    folder: string | null;
    file: string | null;
  }> = {},
) {
  return editorNavigate(navigate, {
    to: Page.EditorMedia,
    search: cleanSearch({ ...DEFAULT_MEDIA_SEARCH, ...search }),
  });
}

export function navigateToCatalogEntry(
  navigate: EditorNavigate,
  category: CatalogCategory,
  key: string | null,
) {
  return editorNavigate(navigate, {
    to: Page.EditorAssets,
    search: cleanSearch({ category, key }),
  });
}

export function navigateToMetaEntry(
  navigate: EditorNavigate,
  kind: MetaEntryKind,
  id: string | null,
) {
  return editorNavigate(navigate, {
    to: Page.EditorMeta,
    search: cleanSearch({ metaKind: kind, metaEntry: id }),
  });
}

export function navigateToLibraryEntry(
  navigate: EditorNavigate,
  kind: LibraryEntryKind,
  id: string | null,
) {
  return editorNavigate(navigate, {
    to: Page.EditorLibrary,
    search: cleanSearch({ libraryKind: kind, libraryEntry: id }),
  });
}

export { editorNavigate };
