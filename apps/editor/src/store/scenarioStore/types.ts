import type { MediaCategory, MediaFileEntry } from "@/lib/mediaLibrary.js";
import type { ProjectEvent, RootFileEntry } from "@/lib/projectApi.js";
import type { TrashEntry } from "@/lib/trash.js";
import type { LoadedBundle } from "@/lib/scenarioLoader.js";
import type { CatalogRefReplacement } from "@/lib/catalogDelete.js";
import type { CatalogCategory } from "@/lib/catalogUsage.js";
import type { MetaRenameResult } from "@/lib/metaRename.js";
import type { CreatedChapter } from "@/lib/chapterFactory.js";
import type { GraphEdgeKind } from "@/lib/graphBuilder.js";
import type { MetaEntryKind } from "@/lib/metaUsage.js";
import type { ValidationIssue } from "@/lib/validation.js";
import type {
  CatalogEntry,
  Chapter,
  Gate,
  NodeContent,
  CharacterDefinition,
  ItemDefinition,
  TextBlock,
  InlineNodeContent,
} from "@/types/wire.js";

export interface HistorySnapshot {
  label: string;
  bundle: LoadedBundle;
}

export interface ScenarioState {
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
  recentContribution: ProjectEvent | null;
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

export type ScenarioSet = (
  partial: Partial<ScenarioState> | ((state: ScenarioState) => Partial<ScenarioState>),
) => void;
export type ScenarioGet = () => ScenarioState;
