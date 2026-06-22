import type { ScenarioGet, ScenarioSet, ScenarioState } from "./types.js";
import { translate } from "@/lib/i18n.js";
import { proposeNewChapter, registerNewChapter } from "@/lib/chapterFactory.js";
import { removeChapterFromBundle, renameChapterId } from "@/lib/chapterLifecycle.js";
import { disconnectChoiceEdgeInBundle } from "@/lib/disconnectChoiceEdge.js";
import { renameNodeId } from "@/lib/renameNodeId.js";
import { createLibrarySidecar, createMetaCatalogSidecar } from "@/lib/sidecarFactory.js";
import type { ChoiceContent, NodeContent } from "@/types/wire.js";
import { cloneBundle } from "./helpers.js";

export function createChapterActions(
  set: ScenarioSet,
  get: ScenarioGet,
): Pick<
  ScenarioState,
  | "updateScenario"
  | "addChapter"
  | "removeChapter"
  | "renameChapterId"
  | "createMetaCatalog"
  | "createLibrary"
  | "addRelationshipOverride"
  | "updateChapter"
  | "updateNode"
  | "addNode"
  | "deleteNode"
  | "renameNode"
  | "addChoice"
  | "connectNodes"
  | "disconnectChoiceEdge"
  | "updateNodePosition"
  | "applyLayout"
> {
  return {
    updateScenario: (patch) => {
      const bundle = get().bundle;
      if (!bundle) return;
      const next = cloneBundle(bundle);
      Object.assign(next.scenario, patch);
      get().commitHistory("scenario");
      set({ bundle: next });
      get().markDirty("scenario");
      get().runValidation();
    },

    addChapter: () => {
      const bundle = get().bundle;
      if (!bundle) return null;
      const next = cloneBundle(bundle);
      const proposal = proposeNewChapter(next);
      const title = translate("defaults.newChapter");
      const created = registerNewChapter(next, proposal, title);
      set({ bundle: next });
      get().markDirty("scenario");
      get().markDirty(`chapter:${created.chapterId}`);
      get().markDirty("layout");
      get().runValidation();
      return created;
    },

    removeChapter: (chapterId) => {
      const bundle = get().bundle;
      if (!bundle) return false;
      const next = cloneBundle(bundle);
      if (!removeChapterFromBundle(next, chapterId)) return false;
      set({ bundle: next });
      get().markDirty("scenario");
      get().markDirty("layout");
      get().runValidation();
      return true;
    },

    renameChapterId: (oldId, newId) => {
      const bundle = get().bundle;
      if (!bundle) return false;
      const next = cloneBundle(bundle);
      if (!renameChapterId(next, oldId, newId)) return false;
      set({ bundle: next });
      get().markDirty("scenario");
      get().markDirty(`chapter:${newId}`);
      get().runValidation();
      return true;
    },

    createMetaCatalog: (fileName) => {
      const bundle = get().bundle;
      if (!bundle || bundle.meta) return false;
      const next = cloneBundle(bundle);
      createMetaCatalogSidecar(next, fileName);
      set({ bundle: next });
      get().markDirty("scenario");
      get().markDirty("meta");
      get().runValidation();
      return true;
    },

    createLibrary: (fileName) => {
      const bundle = get().bundle;
      if (!bundle || bundle.library) return false;
      const next = cloneBundle(bundle);
      createLibrarySidecar(next, fileName);
      set({ bundle: next });
      get().markDirty("scenario");
      get().markDirty("library");
      get().runValidation();
      return true;
    },

    addRelationshipOverride: (charId) => {
      const bundle = get().bundle;
      if (!bundle) return;
      const character = bundle.characters.characters[charId];
      if (!character) return;
      const next = cloneBundle(bundle);
      const declared = character.relationships ?? {};
      next.scenario.relationshipOverrides = {
        ...next.scenario.relationshipOverrides,
        [charId]: { ...declared, ...next.scenario.relationshipOverrides?.[charId] },
      };
      set({ bundle: next });
      get().markDirty("scenario");
    },

    updateChapter: (chapterId, chapter) => {
      const bundle = get().bundle;
      if (!bundle) return;
      const next = cloneBundle(bundle);
      next.chapters[chapterId] = chapter;
      get().commitHistory(`chapter:${chapterId}`);
      set({ bundle: next });
      get().markDirty(`chapter:${chapterId}`);
      get().runValidation();
    },

    updateNode: (chapterId, nodeId, node) => {
      const bundle = get().bundle;
      if (!bundle) return;
      const next = cloneBundle(bundle);
      const chapter = next.chapters[chapterId];
      if (!chapter) return;
      chapter.nodes[nodeId] = node;
      get().commitHistory(`node:${chapterId}:${nodeId}`);
      set({ bundle: next });
      get().markDirty(`chapter:${chapterId}`);
      get().runValidation();
    },

    addNode: (chapterId, nodeId) => {
      const bundle = get().bundle;
      if (!bundle) return;
      const next = cloneBundle(bundle);
      const chapter = next.chapters[chapterId];
      if (!chapter || chapter.nodes[nodeId]) return;

      const node: NodeContent = {
        id: nodeId,
        title: translate("defaults.newNode"),
        mode: "normal",
        text: [{ kind: "paragraph", text: "" }],
        choices: [],
      };
      chapter.nodes[nodeId] = node;
      get().commitHistory(`addNode:${nodeId}`, false);
      set({ bundle: next });
      get().markDirty(`chapter:${chapterId}`);
      get().runValidation();
    },

    deleteNode: (chapterId, nodeId) => {
      const bundle = get().bundle;
      if (!bundle) return;
      const next = cloneBundle(bundle);
      const chapter = next.chapters[chapterId];
      if (!chapter) return;

      delete chapter.nodes[nodeId];
      if (chapter.startNodeId === nodeId && Object.keys(chapter.nodes).length > 0) {
        chapter.startNodeId = Object.keys(chapter.nodes)[0]!;
      }

      const layout = next.layout.chapters[chapterId]?.nodes;
      if (layout) delete layout[nodeId];

      get().commitHistory(`deleteNode:${nodeId}`, false);
      set({ bundle: next });
      get().markDirty(`chapter:${chapterId}`);
      get().markDirty("layout");
      get().runValidation();
    },

    renameNode: (chapterId, oldId, newId) => {
      const bundle = get().bundle;
      if (!bundle) return;
      const next = cloneBundle(bundle);
      renameNodeId(next, chapterId, oldId, newId);
      get().commitHistory(`renameNode:${oldId}`, false);
      set({ bundle: next });
      get().markDirty(`chapter:${chapterId}`);
      get().markDirty("scenario");
      get().markDirty("layout");
      get().markDirty("items");
      get().runValidation();
    },

    addChoice: (chapterId, nodeId) => {
      const bundle = get().bundle;
      if (!bundle) return;
      const next = cloneBundle(bundle);
      const chapter = next.chapters[chapterId];
      if (!chapter) return;
      const node = chapter.nodes[nodeId];
      if (!node) return;

      const choice: ChoiceContent = {
        id: `choice_${Date.now()}`,
        label: translate("defaults.newChoice"),
        goto: "",
      };
      node.choices = [...(node.choices ?? []), choice];
      get().commitHistory(`addChoice:${nodeId}`, false);
      set({ bundle: next });
      get().markDirty(`chapter:${chapterId}`);
      get().runValidation();
    },

    connectNodes: (chapterId, sourceId, targetId) => {
      const bundle = get().bundle;
      if (!bundle) return;
      const next = cloneBundle(bundle);
      const chapter = next.chapters[chapterId];
      if (!chapter) return;
      const source = chapter.nodes[sourceId];
      if (!source) return;

      const choiceId = `choice_${Date.now()}`;
      const choice: ChoiceContent = {
        id: choiceId,
        label: translate("defaults.newChoice"),
        goto: targetId,
      };
      source.choices = [...(source.choices ?? []), choice];
      get().commitHistory(`connect:${sourceId}:${targetId}`, false);
      set({ bundle: next });
      get().markDirty(`chapter:${chapterId}`);
      get().runValidation();
    },

    disconnectChoiceEdge: (chapterId, sourceId, choiceId, kind) => {
      const bundle = get().bundle;
      if (!bundle) return;
      const next = cloneBundle(bundle);
      const chapter = next.chapters[chapterId];
      if (!chapter) return;

      const { chapterDirty, itemsDirty } = disconnectChoiceEdgeInBundle(
        chapter,
        next.items,
        sourceId,
        choiceId,
        kind,
      );
      if (!chapterDirty && !itemsDirty) return;

      get().commitHistory(`disconnect:${sourceId}:${choiceId}`, false);
      set({ bundle: next });
      if (chapterDirty) get().markDirty(`chapter:${chapterId}`);
      if (itemsDirty) get().markDirty("items");
      get().runValidation();
    },

    updateNodePosition: (chapterId, nodeId, x, y) => {
      const bundle = get().bundle;
      if (!bundle) return;
      const next = cloneBundle(bundle);
      if (!next.layout.chapters[chapterId]) {
        next.layout.chapters[chapterId] = { nodes: {} };
      }
      next.layout.chapters[chapterId].nodes[nodeId] = { x, y };
      get().commitHistory(`position:${chapterId}:${nodeId}`);
      set({ bundle: next });
      get().markDirty("layout");
    },

    applyLayout: (chapterId, positions) => {
      const bundle = get().bundle;
      if (!bundle) return;
      const next = cloneBundle(bundle);
      if (!next.layout.chapters[chapterId]) {
        next.layout.chapters[chapterId] = { nodes: {} };
      }
      Object.assign(next.layout.chapters[chapterId].nodes, positions);
      get().commitHistory(`layout:${chapterId}`, false);
      set({ bundle: next });
      get().markDirty("layout");
    },
  };
}
