import type { LoadedBundle } from "./scenarioLoader.js";

export function diffDirtyKeys(a: LoadedBundle, b: LoadedBundle): string[] {
  const keys: string[] = [];
  const differs = (left: unknown, right: unknown) => JSON.stringify(left) !== JSON.stringify(right);

  if (differs(a.scenario, b.scenario)) keys.push("scenario");
  if (differs(a.items, b.items)) keys.push("items");
  if (differs(a.characters, b.characters)) keys.push("characters");
  if (differs(a.assets, b.assets)) keys.push("assets");
  if (differs(a.meta, b.meta)) keys.push("meta");
  if (differs(a.library, b.library)) keys.push("library");
  if (differs(a.layout, b.layout)) keys.push("layout");

  const chapterIds = new Set([...Object.keys(a.chapters), ...Object.keys(b.chapters)]);
  for (const chapterId of chapterIds) {
    if (differs(a.chapters[chapterId], b.chapters[chapterId])) {
      keys.push(`chapter:${chapterId}`);
    }
  }

  return keys;
}
