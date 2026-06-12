import type { LoadedBundle } from "./scenarioLoader.js";
import { translate } from "./i18n.js";
import { CHAPTER_SPEC, SUPPORTED_FORMAT_VERSION, type Chapter } from "../types/wire.js";

export interface NewChapterProposal {
  id: string;
  ref: string;
  startNodeId: string;
}

export interface CreatedChapter {
  chapterId: string;
  startNodeId: string;
}

export function proposeNewChapter(bundle: LoadedBundle): NewChapterProposal {
  const usedIds = new Set([
    ...bundle.scenario.chapters.map((chapter) => chapter.id),
    ...Object.keys(bundle.chapters),
  ]);
  const usedRefs = new Set([
    ...bundle.scenario.chapters.map((chapter) => chapter.ref),
    ...Object.values(bundle.filePaths.chapters),
    ...Object.values(bundle.chapterFiles),
  ]);

  for (let index = 1; index < 1000; index += 1) {
    const id = `chapter_${index}`;
    const ref = `chapter_${String(index).padStart(2, "0")}_${id}.json`;
    if (!usedIds.has(id) && !usedRefs.has(ref)) {
      return { id, ref, startNodeId: `${id}_start` };
    }
  }

  const id = `chapter_${Date.now()}`;
  return { id, ref: `${id}.json`, startNodeId: `${id}_start` };
}

export function createDefaultChapter({
  id,
  title,
  startNodeId,
}: {
  id: string;
  title: string;
  startNodeId: string;
}): Chapter {
  return {
    spec: CHAPTER_SPEC,
    formatVersion: SUPPORTED_FORMAT_VERSION,
    id,
    title,
    startNodeId,
    nodes: {
      [startNodeId]: {
        id: startNodeId,
        title: translate("defaults.newNode"),
        mode: "normal",
        text: [{ kind: "paragraph", text: "" }],
        choices: [],
      },
    },
  };
}

export function registerNewChapter(
  bundle: LoadedBundle,
  proposal: NewChapterProposal,
  title: string,
): CreatedChapter {
  const chapter = createDefaultChapter({
    id: proposal.id,
    title,
    startNodeId: proposal.startNodeId,
  });

  bundle.scenario.chapters = [
    ...bundle.scenario.chapters,
    { id: proposal.id, title, ref: proposal.ref },
  ];
  bundle.chapters[proposal.id] = chapter;
  bundle.chapterFiles[proposal.id] = proposal.ref;
  bundle.filePaths.chapters[proposal.id] = proposal.ref;

  if (!bundle.layout.chapters[proposal.id]) {
    bundle.layout.chapters[proposal.id] = { nodes: {} };
  }
  bundle.layout.chapters[proposal.id]!.nodes[proposal.startNodeId] = { x: 80, y: 80 };

  return { chapterId: proposal.id, startNodeId: proposal.startNodeId };
}
