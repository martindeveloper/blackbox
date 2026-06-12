export type MediaCategory = "textures" | "music" | "sfx";
export const MEDIA_CATEGORIES: MediaCategory[] = ["textures", "music", "sfx"];

export interface MediaFileEntry {
  path: string;
  category: MediaCategory;
  name: string;
  size: number;
  mimeType: string;
}

export function mediaCategoryFromPath(path: string): MediaCategory | null {
  if (path.startsWith("textures/")) return "textures";
  if (path.startsWith("music/")) return "music";
  if (path.startsWith("sfx/")) return "sfx";
  return null;
}

export function defaultImportPath(category: MediaCategory, fileName: string): string {
  return category === "textures" ? `textures/backgrounds/${fileName}` : `${category}/${fileName}`;
}

export function parseMediaCategory(raw: string | undefined | null): MediaCategory {
  return raw === "music" || raw === "sfx" ? raw : "textures";
}
