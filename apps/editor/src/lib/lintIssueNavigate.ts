import type { LoadedBundle } from "./scenarioLoader.js";
import { Page } from "./pages.js";
import type { LintIssue } from "./toolsApi.js";

export type LintNavigateTarget = {
  to: Page.EditorGraph | Page.EditorLibrary;
  search: Record<string, string | null | undefined>;
};

const LIBRARY_ISSUE_CODES = new Set([
  "unknown-snippet",
  "unknown-template",
  "unknown-condition",
  "library-ref-missing",
]);

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function basename(path: string): string {
  const normalized = normalizePath(path);
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

function isScenarioLintFile(bundle: LoadedBundle, chapterFile: string): boolean {
  const normalized = normalizePath(chapterFile);
  const scenarioPath = normalizePath(bundle.filePaths.scenario);
  const scenarioFull = normalizePath(`${bundle.scenarioDir}/${scenarioPath}`);
  return (
    normalized === scenarioPath ||
    normalized.endsWith(`/${scenarioPath}`) ||
    normalized === scenarioFull ||
    basename(normalized) === basename(scenarioPath)
  );
}

function chapterIdFromLintFile(bundle: LoadedBundle, chapterFile: string): string | null {
  const normalized = normalizePath(chapterFile);
  for (const [chapterId, ref] of Object.entries(bundle.filePaths.chapters)) {
    const refNorm = normalizePath(ref);
    const full = normalizePath(`${bundle.scenarioDir}/${refNorm}`);
    if (
      normalized === refNorm ||
      normalized === full ||
      normalized.endsWith(`/${refNorm}`) ||
      basename(normalized) === refNorm
    ) {
      return chapterId;
    }
  }
  return null;
}

function chapterIdForNode(bundle: LoadedBundle, nodeId: string): string | null {
  for (const [chapterId, chapter] of Object.entries(bundle.chapters)) {
    if (chapter.nodes[nodeId]) return chapterId;
  }
  return null;
}

export function lintIssueLocationLabel(issue: LintIssue): string | null {
  if (issue.chapterFile && issue.nodeId) {
    return `${basename(issue.chapterFile)} · ${issue.nodeId}`;
  }
  if (issue.nodeId) return issue.nodeId;
  if (issue.chapterFile) return basename(issue.chapterFile);
  return null;
}

export function lintIssueNavigateTarget(
  issue: LintIssue,
  bundle: LoadedBundle | null,
): LintNavigateTarget | null {
  if (!bundle) return null;

  const nodeId = issue.nodeId?.trim();
  if (!nodeId) return null;

  if (nodeId === "__death__") {
    return {
      to: Page.EditorGraph,
      search: { chapter: null, node: null, globalNode: "death" },
    };
  }

  const chapterFromNode = chapterIdForNode(bundle, nodeId);
  const inLibraryTemplates = Boolean(bundle.library?.templates[nodeId]);

  if (inLibraryTemplates && !chapterFromNode && LIBRARY_ISSUE_CODES.has(issue.code)) {
    return {
      to: Page.EditorLibrary,
      search: { libraryKind: "template", libraryEntry: nodeId },
    };
  }

  let chapterId = issue.chapterFile ? chapterIdFromLintFile(bundle, issue.chapterFile) : null;

  if (
    !chapterId &&
    issue.chapterFile &&
    isScenarioLintFile(bundle, issue.chapterFile) &&
    bundle.scenario.deathNode &&
    !chapterFromNode
  ) {
    return {
      to: Page.EditorGraph,
      search: { chapter: null, node: null, globalNode: "death" },
    };
  }

  if (!chapterId) {
    chapterId = chapterFromNode;
  }

  if (!chapterId) return null;

  return {
    to: Page.EditorGraph,
    search: { chapter: chapterId, node: nodeId, globalNode: null },
  };
}
