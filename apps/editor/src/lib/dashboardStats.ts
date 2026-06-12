import { entriesForCategory } from "./catalogHealth.js";
import type { LoadedBundle } from "./scenarioLoader.js";
import type { ValidationIssue } from "./validation.js";
import type { MediaFileEntry } from "./mediaLibrary.js";

export interface DashboardStats {
  chapters: number;
  nodes: number;
  choices: number;
  characters: number;
  items: number;
  textures: number;
  music: number;
  sfx: number;
  events: number;
  flags: number;
  snippets: number;
  templates: number;
  conditions: number;
  mediaFiles: number;
  validationErrors: number;
  validationWarnings: number;
  unsavedDocs: number;
}

export function collectDashboardStats(
  bundle: LoadedBundle,
  mediaFiles: MediaFileEntry[],
  validationIssues: ValidationIssue[],
  dirtyCount: number,
): DashboardStats {
  let nodes = 0;
  let choices = 0;
  for (const chapter of Object.values(bundle.chapters)) {
    const chapterNodes = Object.values(chapter.nodes);
    nodes += chapterNodes.length;
    for (const node of chapterNodes) {
      choices += node.choices?.length ?? 0;
    }
  }

  const meta = bundle.meta;
  const library = bundle.library;

  return {
    chapters: bundle.scenario.chapters.length,
    nodes,
    choices,
    characters: Object.keys(bundle.characters.characters).length,
    items: Object.keys(bundle.items.items).length,
    textures: Object.keys(entriesForCategory(bundle.assets, "textures")).length,
    music: Object.keys(entriesForCategory(bundle.assets, "music")).length,
    sfx: Object.keys(entriesForCategory(bundle.assets, "sfx")).length,
    events: Object.keys(meta?.events ?? {}).length,
    flags: Object.keys(meta?.flags ?? {}).length,
    snippets: Object.keys(library?.snippets ?? {}).length,
    templates: Object.keys(library?.templates ?? {}).length,
    conditions: Object.keys(library?.conditions ?? {}).length,
    mediaFiles: mediaFiles.length,
    validationErrors: validationIssues.filter((i) => i.severity === "error").length,
    validationWarnings: validationIssues.filter((i) => i.severity === "warning").length,
    unsavedDocs: dirtyCount,
  };
}
