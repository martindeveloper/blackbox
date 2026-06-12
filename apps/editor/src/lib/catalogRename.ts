import { entriesForCategory } from "./catalogHealth.js";
import { rewriteCatalogRefs } from "./catalogDelete.js";
import type { CatalogCategory } from "./catalogUsage.js";
import type { LoadedBundle } from "./scenarioLoader.js";

const CATALOG_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type CatalogRenameResult =
  | { ok: true; dirtyKeys: Set<string> }
  | { ok: false; reason: "empty" | "invalid" | "collision" | "missing" | "unchanged" };

export function validateCatalogId(id: string): "empty" | "invalid" | null {
  if (!id) return "empty";
  return CATALOG_ID_PATTERN.test(id) ? null : "invalid";
}

export function renameCatalogEntry(
  bundle: LoadedBundle,
  category: CatalogCategory,
  oldKey: string,
  newKey: string,
): CatalogRenameResult {
  if (oldKey === newKey) return { ok: false, reason: "unchanged" };

  const invalidReason = validateCatalogId(newKey);
  if (invalidReason) return { ok: false, reason: invalidReason };

  const currentEntries = entriesForCategory(bundle.assets, category);
  const entry = currentEntries[oldKey];
  if (!entry) return { ok: false, reason: "missing" };
  if (currentEntries[newKey]) return { ok: false, reason: "collision" };

  const entries = { ...currentEntries };
  delete entries[oldKey];
  entries[newKey] = entry;

  if (category === "textures") bundle.assets.textures = entries;
  else if (category === "music") bundle.assets.music = entries;
  else bundle.assets.sfx = entries;

  const dirtyKeys = rewriteCatalogRefs(bundle, category, oldKey, {
    mode: "replace",
    replacementKey: newKey,
  });
  dirtyKeys.add("assets");
  return { ok: true, dirtyKeys };
}
