import { create } from "zustand";
import { defaultImportPath, type MediaCategory, type MediaFileEntry } from "../lib/mediaLibrary.js";
import {
  ApiError,
  bootstrapProjectCode,
  deleteTrash,
  emptyTrash as emptyTrashApi,
  restoreTrash,
  saveDocuments,
  subscribeProject,
  trashMedia,
  uploadMedia,
  type ProjectEvent,
  type RootFileEntry,
} from "../lib/projectApi.js";
import { openProjectWithPrompts } from "../lib/openProjectFlow.js";
import type { TrashEntry } from "../lib/trash.js";
import { renameNodeId } from "../lib/renameNodeId.js";
import type { LoadedBundle } from "../lib/scenarioLoader.js";
import { collectDirtyDocuments } from "../lib/scenarioWriter.js";
import { translate } from "../lib/i18n.js";
import { confirmModal } from "../lib/modalApi.js";
import { notifyError, notifyFromError, notifySuccess } from "../lib/notifyApi.js";
import { deleteCatalogEntry, type CatalogRefReplacement } from "../lib/catalogDelete.js";
import { renameCatalogEntry } from "../lib/catalogRename.js";
import type { CatalogCategory } from "../lib/catalogUsage.js";
import { renameMetaEntry, type MetaRenameResult } from "../lib/metaRename.js";
import {
  proposeNewChapter,
  registerNewChapter,
  type CreatedChapter,
} from "../lib/chapterFactory.js";
import { removeChapterFromBundle, renameChapterId } from "../lib/chapterLifecycle.js";
import { disconnectChoiceEdgeInBundle } from "../lib/disconnectChoiceEdge.js";
import { diffDirtyKeys } from "../lib/historyDiff.js";
import type { GraphEdgeKind } from "../lib/graphBuilder.js";
import { createLibrarySidecar, createMetaCatalogSidecar } from "../lib/sidecarFactory.js";
import type { MetaEntryKind } from "../lib/metaUsage.js";
import { validateBundle, type ValidationIssue } from "../lib/validation.js";
import type {
  CatalogEntry,
  Chapter,
  ChoiceContent,
  Gate,
  NodeContent,
  CharacterDefinition,
  ItemDefinition,
  TextBlock,
  InlineNodeContent,
} from "../types/wire.js";

interface HistorySnapshot {
  label: string;
  bundle: LoadedBundle;
}

const HISTORY_LIMIT = 100;
const HISTORY_COALESCE_MS = 600;

interface ScenarioState {
  bundle: LoadedBundle | null;
  projectName: string | null;
  projectPath: string | null;
  projectId: string | null;
  projectCodeTrusted: boolean | null;
  projectHasCustomCode: boolean;
  revision: number | null;
  rootFiles: RootFileEntry[];
  mediaFiles: MediaFileEntry[];
  trashItems: TrashEntry[];
  dirty: Set<string>;
  editVersion: number;
  narrativeVersion: number;
  conflict: ProjectEvent | null;
  validationIssues: ValidationIssue[];
  saving: boolean;
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];

  commitHistory: (label: string, coalesce?: boolean) => void;
  undo: () => void;
  redo: () => void;
  openProject: (projectId: string) => Promise<boolean>;
  reloadProject: () => Promise<boolean>;
  bootstrapProjectCode: () => Promise<boolean>;
  overwriteConflict: () => Promise<boolean>;
  refreshMediaLibrary: () => Promise<void>;
  importMediaFile: (category: MediaCategory, targetDir?: string) => Promise<string | null>;
  deleteMediaFile: (path: string) => Promise<boolean>;
  restoreTrashItem: (id: string) => Promise<void>;
  permanentlyDeleteTrashItem: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  save: (force?: boolean) => Promise<boolean>;
  markDirty: (key: string) => void;
  updateScenario: (patch: Partial<LoadedBundle["scenario"]>) => void;
  addChapter: () => CreatedChapter | null;
  removeChapter: (chapterId: string) => boolean;
  renameChapterId: (oldId: string, newId: string) => boolean;
  createMetaCatalog: (fileName?: string) => boolean;
  createLibrary: (fileName?: string) => boolean;
  addRelationshipOverride: (charId: string) => void;
  updateChapter: (chapterId: string, chapter: Chapter) => void;
  updateNode: (chapterId: string, nodeId: string, node: NodeContent) => void;
  addNode: (chapterId: string, nodeId: string) => void;
  deleteNode: (chapterId: string, nodeId: string) => void;
  renameNode: (chapterId: string, oldId: string, newId: string) => void;
  addChoice: (chapterId: string, nodeId: string) => void;
  connectNodes: (chapterId: string, sourceId: string, targetId: string) => void;
  disconnectChoiceEdge: (
    chapterId: string,
    sourceId: string,
    choiceId: string,
    kind: GraphEdgeKind,
  ) => void;
  updateNodePosition: (chapterId: string, nodeId: string, x: number, y: number) => void;
  applyLayout: (chapterId: string, positions: Record<string, { x: number; y: number }>) => void;
  updateItem: (itemId: string, item: ItemDefinition) => void;
  addItem: (itemId: string) => void;
  deleteItem: (itemId: string) => void;
  updateCharacter: (charId: string, char: CharacterDefinition) => void;
  addCharacter: (charId: string) => void;
  deleteCharacter: (charId: string) => void;
  updateAssets: (patch: Partial<LoadedBundle["assets"]>) => void;
  renameAssetEntry: (category: CatalogCategory, oldKey: string, newKey: string) => boolean;
  deleteAssetEntry: (
    category: CatalogCategory,
    assetKey: string,
    replacement: CatalogRefReplacement | null,
  ) => void;
  updateMetaEntry: (kind: MetaEntryKind, id: string, patch: Partial<CatalogEntry>) => void;
  addMetaEntry: (kind: MetaEntryKind, id: string) => void;
  deleteMetaEntry: (kind: MetaEntryKind, id: string) => void;
  renameMetaEntry: (kind: MetaEntryKind, oldId: string, newId: string) => MetaRenameResult;
  updateLibrarySnippet: (id: string, block: TextBlock) => void;
  updateLibraryTemplate: (id: string, template: InlineNodeContent) => void;
  addLibrarySnippet: (id: string) => void;
  addLibraryTemplate: (id: string) => void;
  deleteLibrarySnippet: (id: string) => void;
  deleteLibraryTemplate: (id: string) => void;
  updateLibraryCondition: (id: string, gate: Gate) => void;
  addLibraryCondition: (id: string) => void;
  deleteLibraryCondition: (id: string) => void;
  updateGlobalDeathNode: (node: InlineNodeContent) => void;
  deleteGlobalDeathNode: () => void;
  runValidation: () => void;
  closeFolder: () => void;
}

function cloneBundle(bundle: LoadedBundle): LoadedBundle {
  return structuredClone(bundle);
}

let lastCommitLabel: string | null = null;
let lastCommitAt = 0;

function resetHistory(): { undoStack: HistorySnapshot[]; redoStack: HistorySnapshot[] } {
  lastCommitLabel = null;
  lastCommitAt = 0;
  return { undoStack: [], redoStack: [] };
}

function applyHistorySnapshot(
  get: () => ScenarioState,
  set: (partial: Partial<ScenarioState>) => void,
  current: LoadedBundle,
  entry: HistorySnapshot,
  stacks: { undoStack: HistorySnapshot[]; redoStack: HistorySnapshot[] },
): void {
  const dirty = new Set(get().dirty);
  for (const key of diffDirtyKeys(current, entry.bundle)) dirty.add(key);
  lastCommitLabel = null;
  lastCommitAt = 0;
  set({
    bundle: entry.bundle,
    dirty,
    editVersion: get().editVersion + 1,
    narrativeVersion: get().narrativeVersion + 1,
    ...stacks,
  });
  get().runValidation();
}

let unsubscribeProject: (() => void) | null = null;

function pickMediaFile(category: MediaCategory): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = category === "textures" ? "image/*" : "audio/*";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  bundle: null,
  projectName: null,
  projectPath: null,
  projectId: null,
  projectCodeTrusted: null,
  projectHasCustomCode: false,
  revision: null,
  rootFiles: [],
  mediaFiles: [],
  trashItems: [],
  dirty: new Set(),
  editVersion: 0,
  narrativeVersion: 0,
  conflict: null,
  validationIssues: [],
  saving: false,
  undoStack: [],
  redoStack: [],

  commitHistory: (label, coalesce = true) => {
    const { bundle, undoStack } = get();
    if (!bundle) return;
    const now = Date.now();
    if (
      coalesce &&
      undoStack.length > 0 &&
      lastCommitLabel === label &&
      now - lastCommitAt < HISTORY_COALESCE_MS
    ) {
      lastCommitAt = now;
      return;
    }
    const nextStack = [...undoStack, { label, bundle: cloneBundle(bundle) }];
    if (nextStack.length > HISTORY_LIMIT) nextStack.shift();
    lastCommitLabel = label;
    lastCommitAt = now;
    set({ undoStack: nextStack, redoStack: [] });
  },

  undo: () => {
    const { undoStack, redoStack, bundle } = get();
    if (undoStack.length === 0 || !bundle) return;
    const entry = undoStack[undoStack.length - 1]!;
    applyHistorySnapshot(get, set, bundle, entry, {
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, { label: entry.label, bundle }],
    });
  },

  redo: () => {
    const { undoStack, redoStack, bundle } = get();
    if (redoStack.length === 0 || !bundle) return;
    const entry = redoStack[redoStack.length - 1]!;
    applyHistorySnapshot(get, set, bundle, entry, {
      undoStack: [...undoStack, { label: entry.label, bundle }],
      redoStack: redoStack.slice(0, -1),
    });
  },

  openProject: async (projectId) => {
    try {
      const snapshot = await openProjectWithPrompts(projectId);
      if (!snapshot) return false;
      unsubscribeProject?.();
      set({
        projectId: snapshot.project.id,
        projectName: snapshot.project.name,
        projectPath: snapshot.project.path,
        projectCodeTrusted: snapshot.project.codeTrusted,
        projectHasCustomCode: snapshot.project.hasCustomCode,
        revision: snapshot.project.revision,
        bundle: snapshot.bundle,
        rootFiles: snapshot.rootFiles,
        mediaFiles: snapshot.mediaFiles,
        trashItems: snapshot.trashItems,
        dirty: new Set(),
        editVersion: 0,
        narrativeVersion: 0,
        conflict: null,
        validationIssues: validateBundle(snapshot.bundle),
        ...resetHistory(),
      });
      unsubscribeProject = subscribeProject(projectId, (event) => {
        const state = get();
        if (event.revision <= (state.revision ?? 0)) return;
        if (state.dirty.size > 0 || state.saving) {
          set({ conflict: event });
          return;
        }
        void get().reloadProject();
      });
      return true;
    } catch (error) {
      notifyFromError(error);
      return false;
    }
  },

  reloadProject: async () => {
    const projectId = get().projectId;
    if (!projectId) return false;
    return get().openProject(projectId);
  },

  bootstrapProjectCode: async () => {
    const projectId = get().projectId;
    if (!projectId) return false;
    try {
      const created = await bootstrapProjectCode(projectId);
      await get().reloadProject();
      if (created.length > 0) {
        notifySuccess(translate("fileTree.bootstrapCodeDone", { count: created.length }));
      } else {
        notifySuccess(translate("fileTree.bootstrapCodeExists"));
      }
      return true;
    } catch (error) {
      notifyFromError(error);
      return false;
    }
  },

  overwriteConflict: async () => {
    if (!get().conflict) return true;
    return get().save(true);
  },

  refreshMediaLibrary: async () => {
    if (get().dirty.size > 0) return;
    await get().reloadProject();
  },

  importMediaFile: async (category, targetDir) => {
    const { projectId, revision, conflict } = get();
    if (!projectId || revision === null || conflict) return null;
    try {
      const file = await pickMediaFile(category);
      if (!file) return null;
      const destination =
        targetDir ?? defaultImportPath(category, file.name).replace(`/${file.name}`, "");
      const result = await uploadMedia(projectId, revision, destination, file);
      set({ revision: result.revision, mediaFiles: result.mediaFiles });
      notifySuccess(translate("notifications.importSuccess"));
      return result.path;
    } catch (error) {
      if (error instanceof ApiError && error.code === "revision_conflict") {
        set({ conflict: { revision: error.currentRevision ?? revision, changedPaths: [] } });
      }
      notifyFromError(error);
      return null;
    }
  },

  deleteMediaFile: async (relativePath) => {
    const { projectId, revision, mediaFiles, conflict } = get();
    if (!projectId || revision === null || conflict) return false;
    const fileEntry = mediaFiles.find((file) => file.path === relativePath);
    if (!fileEntry) {
      notifyError(translate("store.fileNotFound", { path: relativePath }));
      return false;
    }

    const ok = await confirmModal({
      title: translate("store.moveToTrashTitle"),
      message: translate("store.moveToTrashMessage", { name: fileEntry.name }),
      variant: "danger",
      confirmLabel: translate("store.moveToTrashConfirm"),
    });
    if (!ok) return false;

    try {
      const result = await trashMedia(projectId, revision, relativePath);
      set({
        revision: result.revision,
        mediaFiles: result.mediaFiles,
        trashItems: result.trashItems,
      });
      notifySuccess(translate("notifications.movedToTrash", { name: fileEntry.name }));
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.code === "revision_conflict") {
        set({ conflict: { revision: error.currentRevision ?? revision, changedPaths: [] } });
      }
      notifyFromError(error);
      return false;
    }
  },

  restoreTrashItem: async (id) => {
    const { projectId, revision, trashItems, conflict } = get();
    if (!projectId || revision === null || conflict) return;
    const entry = trashItems.find((t) => t.id === id);
    if (!entry) return;

    try {
      let result;
      try {
        result = await restoreTrash(projectId, revision, id, false);
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "file_exists") throw error;
        const ok = await confirmModal({
          title: translate("store.fileExistsTitle"),
          message: translate("store.fileExistsMessage", { path: entry.originalPath }),
          variant: "danger",
          confirmLabel: translate("store.overwrite"),
        });
        if (!ok) return;
        result = await restoreTrash(projectId, revision, id, true);
      }
      set({
        revision: result.revision,
        mediaFiles: result.mediaFiles,
        trashItems: result.trashItems,
      });
      notifySuccess(
        translate("notifications.restored", {
          name: entry.originalPath.split("/").pop() ?? entry.originalPath,
        }),
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === "revision_conflict") {
        set({ conflict: { revision: error.currentRevision ?? revision, changedPaths: [] } });
      }
      notifyFromError(error);
    }
  },

  permanentlyDeleteTrashItem: async (id) => {
    const { projectId, revision, trashItems, conflict } = get();
    if (!projectId || revision === null || conflict) return;
    const entry = trashItems.find((t) => t.id === id);
    if (!entry) return;

    const ok = await confirmModal({
      title: translate("store.deletePermanentlyTitle"),
      message: translate("store.deletePermanentlyMessage", {
        name: entry.originalPath.split("/").pop() ?? entry.originalPath,
      }),
      variant: "danger",
      confirmLabel: translate("store.deletePermanentlyConfirm"),
    });
    if (!ok) return;

    try {
      const result = await deleteTrash(projectId, revision, id);
      set({ revision: result.revision, trashItems: result.trashItems });
      notifySuccess(translate("notifications.permanentlyDeleted"));
    } catch (error) {
      if (error instanceof ApiError && error.code === "revision_conflict") {
        set({ conflict: { revision: error.currentRevision ?? revision, changedPaths: [] } });
      }
      notifyFromError(error);
    }
  },

  emptyTrash: async () => {
    const { projectId, revision, trashItems, conflict } = get();
    if (!projectId || revision === null || conflict || trashItems.length === 0) return;

    const ok = await confirmModal({
      title: translate("store.emptyTrashTitle"),
      message: translate("store.emptyTrashMessage", { count: trashItems.length }),
      variant: "danger",
      confirmLabel: translate("store.emptyTrashConfirm"),
    });
    if (!ok) return;

    try {
      const result = await emptyTrashApi(projectId, revision);
      set({ revision: result.revision, trashItems: result.trashItems });
      notifySuccess(translate("notifications.trashEmptied"));
    } catch (error) {
      if (error instanceof ApiError && error.code === "revision_conflict") {
        set({ conflict: { revision: error.currentRevision ?? revision, changedPaths: [] } });
      }
      notifyFromError(error);
    }
  },

  save: async (force = false) => {
    const { projectId, revision, bundle, dirty, editVersion, conflict } = get();
    if (!projectId || revision === null || !bundle) return false;
    if (dirty.size === 0) return !conflict;
    if (conflict && !force) return false;
    const capturedDirty = new Set(dirty);
    const documents = collectDirtyDocuments(bundle, capturedDirty);
    set({ saving: true });
    try {
      const nextRevision = await saveDocuments(projectId, revision, documents, force);
      const unchanged = get().editVersion === editVersion;
      set({
        revision: nextRevision,
        dirty: unchanged ? new Set() : get().dirty,
        saving: false,
        conflict: null,
        validationIssues: validateBundle(get().bundle ?? bundle),
      });
      notifySuccess(translate("notifications.saveSuccess"));
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.code === "revision_conflict") {
        set({
          saving: false,
          conflict: { revision: error.currentRevision ?? revision, changedPaths: [] },
        });
      } else {
        set({ saving: false });
      }
      notifyFromError(error);
      return false;
    }
  },

  markDirty: (key) => {
    const dirty = new Set(get().dirty);
    dirty.add(key);
    set({
      dirty,
      editVersion: get().editVersion + 1,
      narrativeVersion: key === "layout" ? get().narrativeVersion : get().narrativeVersion + 1,
    });
  },

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

  updateItem: (itemId, item) => {
    const bundle = get().bundle;
    if (!bundle) return;
    const next = cloneBundle(bundle);
    next.items.items[itemId] = item;
    get().commitHistory(`item:${itemId}`);
    set({ bundle: next });
    get().markDirty("items");
    get().runValidation();
  },

  addItem: (itemId) => {
    const bundle = get().bundle;
    if (!bundle || bundle.items.items[itemId]) return;
    const next = cloneBundle(bundle);
    next.items.items[itemId] = {
      id: itemId,
      name: translate("defaults.newItem"),
      description: "",
      actions: [],
    };
    set({ bundle: next });
    get().markDirty("items");
  },

  deleteItem: (itemId) => {
    const bundle = get().bundle;
    if (!bundle) return;
    const next = cloneBundle(bundle);
    delete next.items.items[itemId];
    set({ bundle: next });
    get().markDirty("items");
    get().runValidation();
  },

  updateCharacter: (charId, char) => {
    const bundle = get().bundle;
    if (!bundle) return;
    const next = cloneBundle(bundle);
    next.characters.characters[charId] = char;
    get().commitHistory(`character:${charId}`);
    set({ bundle: next });
    get().markDirty("characters");
  },

  addCharacter: (charId) => {
    const bundle = get().bundle;
    if (!bundle || bundle.characters.characters[charId]) return;
    const next = cloneBundle(bundle);
    next.characters.characters[charId] = {
      id: charId,
      name: translate("defaults.newCharacter"),
    };
    set({ bundle: next });
    get().markDirty("characters");
  },

  deleteCharacter: (charId) => {
    const bundle = get().bundle;
    if (!bundle) return;
    const next = cloneBundle(bundle);
    delete next.characters.characters[charId];
    if (next.scenario.relationshipOverrides?.[charId]) {
      const overrides = { ...next.scenario.relationshipOverrides };
      delete overrides[charId];
      next.scenario.relationshipOverrides =
        Object.keys(overrides).length > 0 ? overrides : undefined;
      get().markDirty("scenario");
    }
    set({ bundle: next });
    get().markDirty("characters");
  },

  updateAssets: (patch) => {
    const bundle = get().bundle;
    if (!bundle) return;
    const next = cloneBundle(bundle);
    Object.assign(next.assets, patch);
    get().commitHistory("assets");
    set({ bundle: next });
    get().markDirty("assets");
  },

  renameAssetEntry: (category, oldKey, requestedKey) => {
    const bundle = get().bundle;
    if (!bundle) return false;
    const newKey = requestedKey.trim();
    const next = cloneBundle(bundle);
    const result = renameCatalogEntry(next, category, oldKey, newKey);

    if (!result.ok) {
      if (result.reason === "collision") {
        notifyError(translate("catalog.rename.collision", { assetKey: newKey }));
      } else if (result.reason === "invalid" || result.reason === "empty") {
        notifyError(translate("catalog.rename.invalid"));
      } else if (result.reason === "missing") {
        notifyError(translate("catalog.rename.missing", { assetKey: oldKey }));
      }
      return false;
    }

    set({ bundle: next });
    for (const key of result.dirtyKeys) get().markDirty(key);
    get().runValidation();
    notifySuccess(translate("catalog.rename.success", { oldKey, newKey }));
    return true;
  },

  deleteAssetEntry: (category, assetKey, replacement) => {
    const bundle = get().bundle;
    if (!bundle) return;
    const next = cloneBundle(bundle);
    const { dirtyKeys } = deleteCatalogEntry(next, category, assetKey, replacement);
    set({ bundle: next });
    for (const key of dirtyKeys) get().markDirty(key);
    get().runValidation();
  },

  updateMetaEntry: (kind, id, patch) => {
    const bundle = get().bundle;
    if (!bundle?.meta) return;
    const next = cloneBundle(bundle);
    const catalog = kind === "event" ? next.meta!.events : next.meta!.flags;
    catalog[id] = { ...catalog[id], ...patch };
    get().commitHistory(`meta:${kind}:${id}`);
    set({ bundle: next });
    get().markDirty("meta");
  },

  addMetaEntry: (kind, id) => {
    const bundle = get().bundle;
    if (!bundle?.meta) return;
    const catalog = kind === "event" ? bundle.meta.events : bundle.meta.flags;
    if (catalog[id]) return;
    const next = cloneBundle(bundle);
    const nextCatalog = kind === "event" ? next.meta!.events : next.meta!.flags;
    nextCatalog[id] = { title: "", description: "", internal: false };
    set({ bundle: next });
    get().markDirty("meta");
  },

  deleteMetaEntry: (kind, id) => {
    const bundle = get().bundle;
    if (!bundle?.meta) return;
    const next = cloneBundle(bundle);
    const catalog = kind === "event" ? next.meta!.events : next.meta!.flags;
    delete catalog[id];
    set({ bundle: next });
    get().markDirty("meta");
  },

  renameMetaEntry: (kind, oldId, newId) => {
    const bundle = get().bundle;
    if (!bundle?.meta) return { ok: false, reason: "missing" };
    const next = cloneBundle(bundle);
    const result = renameMetaEntry(next, kind, oldId, newId);
    if (!result.ok) return result;
    set({ bundle: next });
    for (const key of result.dirtyKeys ?? []) get().markDirty(key);
    get().runValidation();
    return result;
  },

  updateLibrarySnippet: (id, block) => {
    const bundle = get().bundle;
    if (!bundle?.library) return;
    const next = cloneBundle(bundle);
    next.library!.snippets[id] = block;
    get().commitHistory(`library:snippet:${id}`);
    set({ bundle: next });
    get().markDirty("library");
  },

  updateLibraryTemplate: (id, template) => {
    const bundle = get().bundle;
    if (!bundle?.library) return;
    const next = cloneBundle(bundle);
    next.library!.templates[id] = template;
    get().commitHistory(`library:template:${id}`);
    set({ bundle: next });
    get().markDirty("library");
  },

  addLibrarySnippet: (id) => {
    const bundle = get().bundle;
    if (!bundle?.library) return;
    if (bundle.library.snippets[id]) return;
    const next = cloneBundle(bundle);
    next.library!.snippets[id] = { kind: "paragraph", text: "" };
    set({ bundle: next });
    get().markDirty("library");
  },

  addLibraryTemplate: (id) => {
    const bundle = get().bundle;
    if (!bundle?.library) return;
    if (bundle.library.templates[id]) return;
    const next = cloneBundle(bundle);
    next.library!.templates[id] = {};
    set({ bundle: next });
    get().markDirty("library");
  },

  deleteLibrarySnippet: (id) => {
    const bundle = get().bundle;
    if (!bundle?.library) return;
    const next = cloneBundle(bundle);
    delete next.library!.snippets[id];
    set({ bundle: next });
    get().markDirty("library");
    get().runValidation();
  },

  deleteLibraryTemplate: (id) => {
    const bundle = get().bundle;
    if (!bundle?.library) return;
    const next = cloneBundle(bundle);
    delete next.library!.templates[id];
    set({ bundle: next });
    get().markDirty("library");
    get().runValidation();
  },

  updateLibraryCondition: (id, gate) => {
    const bundle = get().bundle;
    if (!bundle?.library) return;
    const next = cloneBundle(bundle);
    next.library!.conditions ??= {};
    next.library!.conditions[id] = gate;
    get().commitHistory(`library:condition:${id}`);
    set({ bundle: next });
    get().markDirty("library");
  },

  addLibraryCondition: (id) => {
    const bundle = get().bundle;
    if (!bundle?.library) return;
    if ((bundle.library.conditions ?? {})[id] !== undefined) return;
    const next = cloneBundle(bundle);
    next.library!.conditions ??= {};
    next.library!.conditions[id] = { type: "hasFlag", flag: id } satisfies Gate;
    set({ bundle: next });
    get().markDirty("library");
  },

  deleteLibraryCondition: (id) => {
    const bundle = get().bundle;
    if (!bundle?.library) return;
    const next = cloneBundle(bundle);
    if (next.library!.conditions) delete next.library!.conditions[id];
    set({ bundle: next });
    get().markDirty("library");
    get().runValidation();
  },

  updateGlobalDeathNode: (node) => {
    const bundle = get().bundle;
    if (!bundle) return;
    const next = cloneBundle(bundle);
    next.scenario.deathNode = node;
    get().commitHistory("deathNode");
    set({ bundle: next });
    get().markDirty("scenario");
    get().runValidation();
  },

  deleteGlobalDeathNode: () => {
    const bundle = get().bundle;
    if (!bundle) return;
    const next = cloneBundle(bundle);
    delete next.scenario.deathNode;
    get().commitHistory("deathNode", false);
    set({ bundle: next });
    get().markDirty("scenario");
    get().runValidation();
  },

  runValidation: () => {
    const bundle = get().bundle;
    if (!bundle) return;
    set({ validationIssues: validateBundle(bundle) });
  },

  closeFolder: () => {
    unsubscribeProject?.();
    unsubscribeProject = null;
    set({
      bundle: null,
      projectName: null,
      projectPath: null,
      projectId: null,
      projectCodeTrusted: null,
      projectHasCustomCode: false,
      revision: null,
      rootFiles: [],
      mediaFiles: [],
      trashItems: [],
      dirty: new Set(),
      editVersion: 0,
      narrativeVersion: 0,
      conflict: null,
      validationIssues: [],
      ...resetHistory(),
    });
  },
}));
