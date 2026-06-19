import type { NodeContent } from "../types/wire.js";
import type { LoadedBundle } from "./scenarioLoader.js";

// Correctness checks — reachability, dead-ends, undefined/write-only flags — are owned by
// `blackbox-lint`. This module only computes authoring metrics the linter does not surface.
export interface ChapterPacing {
  chapterId: string;
  title: string;
  nodeCount: number;
  choiceCount: number;
  avgChoices: number;
  endingCount: number;
}

export interface NarrativeMetrics {
  totalNodes: number;
  totalChoices: number;
  endings: number;
  /** Average outgoing routes across non-terminal nodes. */
  avgBranching: number;
  chapters: ChapterPacing[];
}

function isTerminal(node: NodeContent): boolean {
  return node.mode === "ending" || node.mode === "game_over";
}

/** Count the outgoing routes (choices, skill checks, chapter jumps) a node exposes. */
function outgoingRouteCount(node: NodeContent): number {
  let count = 0;
  for (const choice of node.choices ?? []) {
    if (choice.goto) count++;
    if (choice.check?.onSuccess.goto) count++;
    if (choice.check?.onFailure.goto) count++;
    if (choice.check?.onExhausted?.goto) count++;
    if (choice.action?.type === "gotoChapter") count++;
  }
  return count;
}

export function analyzeNarrative(bundle: LoadedBundle): NarrativeMetrics {
  let branchingSum = 0;
  let branchingCount = 0;
  let endings = 0;

  const countNode = (node: NodeContent) => {
    if (node.mode === "ending") endings++;
    if (!isTerminal(node)) {
      branchingSum += outgoingRouteCount(node);
      branchingCount++;
    }
  };

  for (const chapter of Object.values(bundle.chapters)) {
    for (const node of Object.values(chapter.nodes)) countNode(node);
  }
  for (const node of Object.values(bundle.scenario.nodes ?? {})) countNode(node);

  const chapters: ChapterPacing[] = [];
  for (const [chapterId, chapter] of Object.entries(bundle.chapters)) {
    const chapterNodes = Object.values(chapter.nodes);
    const choiceCount = chapterNodes.reduce((sum, n) => sum + (n.choices?.length ?? 0), 0);
    const endingCount = chapterNodes.filter((n) => n.mode === "ending").length;
    chapters.push({
      chapterId,
      title: chapter.title,
      nodeCount: chapterNodes.length,
      choiceCount,
      avgChoices: chapterNodes.length ? choiceCount / chapterNodes.length : 0,
      endingCount,
    });
  }

  const totalNodes = chapters.reduce((sum, c) => sum + c.nodeCount, 0);
  const totalChoices = chapters.reduce((sum, c) => sum + c.choiceCount, 0);

  return {
    totalNodes,
    totalChoices,
    endings,
    avgBranching: branchingCount ? branchingSum / branchingCount : 0,
    chapters,
  };
}
