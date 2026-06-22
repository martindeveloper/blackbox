import type { AssetCatalog } from "@/types/wire.js";
import type { MediaFileEntry } from "./mediaLibrary.js";
import { MEDIA_CATEGORIES } from "./mediaLibrary.js";
import type { LoadedBundle } from "./scenarioLoader.js";
import {
  buildCatalogUsageIndex,
  catalogUsageKey,
  type CatalogCategory,
  type CatalogUsageIndex,
} from "./catalogUsage.js";

export type CatalogFileStatus = "empty" | "found" | "missing";

export interface CatalogCategoryStats {
  category: CatalogCategory;
  total: number;
  used: number;
  unused: number;
  missingFile: number;
  emptySrc: number;
}

export interface CatalogAttentionEntry {
  category: CatalogCategory;
  key: string;
  issue: "unused" | "missingFile" | "emptySrc";
}

export function mediaPathSet(files: MediaFileEntry[]): Set<string> {
  return new Set(files.map((f) => f.path));
}

type CatalogEntryWire = { src: string; loop?: boolean; usage?: "internal" | "external" };

export function isCatalogEntryExternallyUsed(
  assets: AssetCatalog,
  category: CatalogCategory,
  key: string,
): boolean {
  return getCatalogEntry(assets, category, key)?.usage === "external";
}

export function entriesForCategory(
  assets: AssetCatalog,
  category: CatalogCategory,
): Record<string, CatalogEntryWire> {
  if (category === "textures") return assets.textures ?? {};
  if (category === "music") return assets.music ?? {};
  return assets.sfx ?? {};
}

export function catalogAssetIds(assets: AssetCatalog, category: CatalogCategory): string[] {
  return Object.keys(entriesForCategory(assets, category));
}

export function getCatalogEntry(
  assets: AssetCatalog,
  category: CatalogCategory,
  key: string,
): CatalogEntryWire | undefined {
  return entriesForCategory(assets, category)[key];
}

export function findCatalogKeysBySrc(
  assets: AssetCatalog,
  src: string,
): { category: CatalogCategory; id: string }[] {
  const refs: { category: CatalogCategory; id: string }[] = [];
  for (const category of MEDIA_CATEGORIES) {
    for (const [id, entry] of Object.entries(entriesForCategory(assets, category))) {
      if (entry.src === src) refs.push({ category, id });
    }
  }
  return refs.sort((a, b) => a.id.localeCompare(b.id));
}

export function getCatalogFileStatus(
  src: string | undefined,
  mediaPaths: Set<string>,
): CatalogFileStatus {
  if (!src?.trim()) return "empty";
  return mediaPaths.has(src) ? "found" : "missing";
}

export function analyzeCatalogHealth(
  bundle: LoadedBundle,
  mediaPaths: Set<string>,
  usageIndex: CatalogUsageIndex = buildCatalogUsageIndex(bundle),
): {
  stats: CatalogCategoryStats[];
  attention: CatalogAttentionEntry[];
  usageIndex: CatalogUsageIndex;
} {
  const stats: CatalogCategoryStats[] = [];
  const attention: CatalogAttentionEntry[] = [];

  for (const category of MEDIA_CATEGORIES) {
    const entries = entriesForCategory(bundle.assets, category);
    let used = 0;
    let unused = 0;
    let missingFile = 0;
    let emptySrc = 0;

    for (const [key, entry] of Object.entries(entries)) {
      const status = getCatalogFileStatus(entry.src, mediaPaths);
      const externallyUsed = isCatalogEntryExternallyUsed(bundle.assets, category, key);
      if (usageIndex.has(catalogUsageKey(category, key)) || externallyUsed) used += 1;
      else unused += 1;
      if (status === "missing") missingFile += 1;
      if (status === "empty") emptySrc += 1;

      if (status === "empty") {
        attention.push({ category, key, issue: "emptySrc" });
      } else if (status === "missing") {
        attention.push({ category, key, issue: "missingFile" });
      } else if (
        !usageIndex.has(catalogUsageKey(category, key)) &&
        !isCatalogEntryExternallyUsed(bundle.assets, category, key)
      ) {
        attention.push({ category, key, issue: "unused" });
      }
    }

    stats.push({
      category,
      total: Object.keys(entries).length,
      used,
      unused,
      missingFile,
      emptySrc,
    });
  }

  attention.sort((a, b) => {
    const rank = { emptySrc: 0, missingFile: 1, unused: 2 };
    return rank[a.issue] - rank[b.issue] || a.key.localeCompare(b.key);
  });

  return { stats, attention, usageIndex };
}

export function mediaSearchForCatalogSrc(src: string): {
  category: CatalogCategory;
  folder: string;
  file: string;
} | null {
  const trimmed = src.trim();
  if (!trimmed) return null;

  const category = trimmed.split("/")[0];
  if (category !== "textures" && category !== "music" && category !== "sfx") {
    return null;
  }

  const lastSlash = trimmed.lastIndexOf("/");
  const folder = lastSlash === -1 ? category : trimmed.slice(0, lastSlash);

  return { category, folder, file: trimmed };
}
