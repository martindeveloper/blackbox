import type { LoadedBundle } from "./scenarioLoader.js";

export function removeChapterFromBundle(bundle: LoadedBundle, chapterId: string): boolean {
  const index = bundle.scenario.chapters.findIndex((chapter) => chapter.id === chapterId);
  if (index < 0) return false;
  if (bundle.scenario.chapters.length <= 1) return false;

  bundle.scenario.chapters = bundle.scenario.chapters.filter((chapter) => chapter.id !== chapterId);
  delete bundle.chapters[chapterId];
  delete bundle.chapterFiles[chapterId];
  delete bundle.filePaths.chapters[chapterId];
  delete bundle.layout.chapters[chapterId];

  return true;
}

export function renameChapterId(bundle: LoadedBundle, oldId: string, newId: string): boolean {
  if (!oldId || !newId || oldId === newId) return false;
  if (!bundle.chapters[oldId]) return false;
  if (bundle.chapters[newId]) return false;
  if (bundle.scenario.chapters.some((chapter) => chapter.id === newId && chapter.id !== oldId)) {
    return false;
  }

  const chapter = bundle.chapters[oldId]!;
  chapter.id = newId;
  bundle.chapters[newId] = chapter;
  delete bundle.chapters[oldId];

  const chapterFile = bundle.chapterFiles[oldId];
  if (chapterFile) {
    bundle.chapterFiles[newId] = chapterFile;
    delete bundle.chapterFiles[oldId];
  }

  const filePath = bundle.filePaths.chapters[oldId];
  if (filePath) {
    bundle.filePaths.chapters[newId] = filePath;
    delete bundle.filePaths.chapters[oldId];
  }

  const layout = bundle.layout.chapters[oldId];
  if (layout) {
    bundle.layout.chapters[newId] = layout;
    delete bundle.layout.chapters[oldId];
  }

  bundle.scenario.chapters = bundle.scenario.chapters.map((entry) =>
    entry.id === oldId ? { ...entry, id: newId } : entry,
  );

  for (const ch of Object.values(bundle.chapters)) {
    for (const node of Object.values(ch.nodes)) {
      for (const choice of node.choices ?? []) {
        if (choice.action?.type === "gotoChapter" && choice.action.chapterId === oldId) {
          choice.action.chapterId = newId;
        }
      }
    }
  }

  if (bundle.scenario.deathNode?.choices) {
    for (const choice of bundle.scenario.deathNode.choices) {
      if (choice.action?.type === "gotoChapter" && choice.action.chapterId === oldId) {
        choice.action.chapterId = newId;
      }
    }
  }

  return true;
}
