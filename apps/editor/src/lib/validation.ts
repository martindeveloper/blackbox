import type { ChoiceContent, Gate, ItemCatalog, NodeContent } from "@/types/wire.js";
import { translate } from "./i18n.js";
import type { LoadedBundle } from "./scenarioLoader.js";
import { isTextBlock, snippetIdFromTextEntry } from "./libraryRefs.js";

export interface ValidationIssue {
  id: string;
  severity: "error" | "warning";
  message: string;
  chapterId?: string;
  nodeId?: string;
}

function collectGotoTargets(gate: Gate | undefined, targets: Set<string>): void {
  if (!gate) return;
  if (Array.isArray(gate)) {
    for (const g of gate) collectGotoTargets(g, targets);
    return;
  }
  if (gate.type === "visited" || gate.type === "atNode") {
    targets.add(gate.nodeId);
  }
  if (gate.type === "all" || gate.type === "any") {
    for (const c of gate.conditions) collectGotoTargets(c, targets);
  }
  if (gate.type === "not") {
    collectGotoTargets(gate.condition, targets);
  }
}

function collectChoiceRefs(choice: ChoiceContent, nodeIds: Set<string>): void {
  if (choice.goto) nodeIds.add(choice.goto);
  if (choice.check?.onSuccess.goto) nodeIds.add(choice.check.onSuccess.goto);
  if (choice.check?.onFailure.goto) nodeIds.add(choice.check.onFailure.goto);
  if (choice.check?.onExhausted?.goto) nodeIds.add(choice.check.onExhausted.goto);
  if (choice.when) collectGotoTargets(choice.when, nodeIds);
  if (choice.unless) collectGotoTargets(choice.unless, nodeIds);
  if (choice.requires) collectGotoTargets(choice.requires, nodeIds);
}

function allNodeIds(bundle: LoadedBundle): Set<string> {
  const ids = new Set<string>();
  for (const chapter of Object.values(bundle.chapters)) {
    for (const id of Object.keys(chapter.nodes)) ids.add(id);
  }
  if (bundle.scenario.nodes) {
    for (const id of Object.keys(bundle.scenario.nodes)) ids.add(id);
  }
  return ids;
}

export function validateBundle(bundle: LoadedBundle): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const globalNodeIds = allNodeIds(bundle);
  const seenIds = new Map<string, string>();

  for (const [chapterId, chapter] of Object.entries(bundle.chapters)) {
    if (!chapter.nodes[chapter.startNodeId]) {
      issues.push({
        id: `${chapterId}-start`,
        severity: "error",
        message: translate("validation.chapterStartNotFound", {
          title: chapter.title,
          startNodeId: chapter.startNodeId,
        }),
        chapterId,
        nodeId: chapter.startNodeId,
      });
    }

    for (const [nodeId, node] of Object.entries(chapter.nodes)) {
      if (node.id !== nodeId) {
        issues.push({
          id: `${chapterId}-${nodeId}-id-mismatch`,
          severity: "error",
          message: translate("validation.nodeKeyIdMismatch", { nodeKey: nodeId, nodeId: node.id }),
          chapterId,
          nodeId,
        });
      }

      const prev = seenIds.get(nodeId);
      if (prev) {
        issues.push({
          id: `dup-${nodeId}`,
          severity: "error",
          message: translate("validation.duplicateNodeId", {
            nodeId,
            chapterA: prev,
            chapterB: chapterId,
          }),
          chapterId,
          nodeId,
        });
      } else {
        seenIds.set(nodeId, chapterId);
      }

      validateNodeRefs(chapterId, nodeId, node, globalNodeIds, issues);

      for (const choice of node.choices ?? []) {
        validateChoiceRefs(chapterId, nodeId, choice, globalNodeIds, bundle, issues);
      }
    }
  }

  for (const [chapterId, chapter] of Object.entries(bundle.chapters)) {
    if (chapter.deathNodeId && !bundle.scenario.deathNode) {
      issues.push({
        id: `${chapterId}-death-node-missing-fallback`,
        severity: "error",
        message: translate("validation.chapterDeathNodeRequiresScenarioDeathNode", {
          chapterId,
        }),
        chapterId,
      });
    }
    if (chapter.deathNodeId && !chapter.nodes[chapter.deathNodeId]) {
      issues.push({
        id: `${chapterId}-death-node`,
        severity: "warning",
        message: translate("validation.deathNodeNotFound", {
          deathNodeId: chapter.deathNodeId,
        }),
        chapterId,
        nodeId: chapter.deathNodeId,
      });
    }
  }

  validateItemRefs(bundle.items, globalNodeIds, issues);
  validateLibraryRefs(bundle, issues);

  return issues;
}

function validateLibraryRefs(bundle: LoadedBundle, issues: ValidationIssue[]): void {
  const snippets = new Set(Object.keys(bundle.library?.snippets ?? {}));
  const templates = new Set(Object.keys(bundle.library?.templates ?? {}));
  const hasLibrary = Boolean(bundle.filePaths.library && bundle.library);

  const checkText = (
    text: unknown[] | undefined,
    chapterId: string | undefined,
    nodeId: string,
    label: string,
  ) => {
    for (const [index, entry] of (text ?? []).entries()) {
      const snippetId = snippetIdFromTextEntry(entry);
      if (!snippetId) continue;
      if (!hasLibrary) {
        issues.push({
          id: `library-missing-${nodeId}-text-${index}`,
          severity: "error",
          message: translate("validation.libraryRefMissing", { snippetId }),
          chapterId,
          nodeId,
        });
        continue;
      }
      if (!snippets.has(snippetId)) {
        issues.push({
          id: `unknown-snippet-${nodeId}-text-${index}`,
          severity: "error",
          message: translate("validation.unknownSnippet", { snippetId, label }),
          chapterId,
          nodeId,
        });
      }
    }
  };

  const checkExtends = (
    templateId: string | undefined,
    chapterId: string | undefined,
    nodeId: string,
  ) => {
    if (!templateId) return;
    if (!hasLibrary) {
      issues.push({
        id: `library-missing-${nodeId}-extends`,
        severity: "error",
        message: translate("validation.extendsWithoutLibrary", { templateId }),
        chapterId,
        nodeId,
      });
      return;
    }
    if (!templates.has(templateId)) {
      issues.push({
        id: `unknown-template-${nodeId}`,
        severity: "error",
        message: translate("validation.unknownTemplate", { templateId, nodeId }),
        chapterId,
        nodeId,
      });
    }
  };

  for (const [chapterId, chapter] of Object.entries(bundle.chapters)) {
    for (const [nodeId, node] of Object.entries(chapter.nodes)) {
      checkText(node.text as unknown[] | undefined, chapterId, nodeId, `${chapterId}/${nodeId}`);
      checkExtends(node.$extends, chapterId, nodeId);
    }
  }

  if (bundle.scenario.deathNode) {
    checkText(
      bundle.scenario.deathNode.text as unknown[] | undefined,
      undefined,
      "__death__",
      "scenario deathNode",
    );
    checkExtends(bundle.scenario.deathNode.$extends, undefined, "__death__");
  }

  if (bundle.library) {
    for (const [templateId, template] of Object.entries(bundle.library.templates)) {
      checkText(
        template.text as unknown[] | undefined,
        undefined,
        templateId,
        `library template '${templateId}'`,
      );
    }
  }
}

function validateNodeRefs(
  chapterId: string,
  nodeId: string,
  node: NodeContent,
  globalNodeIds: Set<string>,
  issues: ValidationIssue[],
): void {
  const refs = new Set<string>();
  for (const block of node.text ?? []) {
    if (!isTextBlock(block)) continue;
    if (block.when) collectGotoTargets(block.when, refs);
    if (block.unless) collectGotoTargets(block.unless, refs);
  }
  for (const ref of refs) {
    if (!globalNodeIds.has(ref)) {
      issues.push({
        id: `${chapterId}-${nodeId}-ref-${ref}`,
        severity: "warning",
        message: translate("validation.nodeUnknownRef", { nodeId, ref }),
        chapterId,
        nodeId,
      });
    }
  }
}

function validateChoiceRefs(
  chapterId: string,
  nodeId: string,
  choice: ChoiceContent,
  globalNodeIds: Set<string>,
  bundle: LoadedBundle,
  issues: ValidationIssue[],
): void {
  const refs = new Set<string>();
  collectChoiceRefs(choice, refs);

  for (const ref of refs) {
    if (!globalNodeIds.has(ref)) {
      issues.push({
        id: `${chapterId}-${nodeId}-choice-${choice.id}-ref-${ref}`,
        severity: "error",
        message: translate("validation.choiceUnknownNode", {
          choiceId: choice.id,
          nodeId,
          ref,
        }),
        chapterId,
        nodeId,
      });
    }
  }

  if (choice.action?.type === "gotoChapter") {
    if (!bundle.chapters[choice.action.chapterId]) {
      issues.push({
        id: `${chapterId}-${nodeId}-choice-${choice.id}-chapter`,
        severity: "error",
        message: translate("validation.choiceUnknownChapter", {
          choiceId: choice.id,
          chapterId: choice.action.chapterId,
        }),
        chapterId,
        nodeId,
      });
    }
  }
}

function validateItemRefs(
  items: ItemCatalog,
  globalNodeIds: Set<string>,
  issues: ValidationIssue[],
): void {
  for (const item of Object.values(items.items)) {
    for (const action of item.actions ?? []) {
      if (action.goto && !globalNodeIds.has(action.goto)) {
        issues.push({
          id: `item-${item.id}-action-${action.id}`,
          severity: "error",
          message: translate("validation.itemActionUnknownNode", {
            actionId: action.id,
            goto: action.goto,
          }),
        });
      }
    }
  }
}
