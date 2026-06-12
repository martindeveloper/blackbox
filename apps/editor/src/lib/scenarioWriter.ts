import type { LoadedBundle } from "./scenarioLoader.js";

export function collectDirtyDocuments(
  bundle: LoadedBundle,
  dirty: Set<string>,
): Record<string, unknown> {
  const documents: Record<string, unknown> = {};
  const add = (key: string, filePath: string | null | undefined, value: unknown) => {
    if (dirty.has(key) && filePath) documents[filePath] = value;
  };

  add("scenario", bundle.filePaths.scenario, bundle.scenario);
  add("items", bundle.filePaths.items, bundle.items);
  add("characters", bundle.filePaths.characters, bundle.characters);
  add("assets", bundle.filePaths.assets, bundle.assets);
  add("meta", bundle.filePaths.meta, bundle.meta);
  add("library", bundle.filePaths.library, bundle.library);
  add("layout", bundle.filePaths.layout, bundle.layout);

  for (const [chapterId, chapter] of Object.entries(bundle.chapters)) {
    add(`chapter:${chapterId}`, bundle.filePaths.chapters[chapterId], chapter);
  }
  return documents;
}
