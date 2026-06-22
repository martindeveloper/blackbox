import { create } from "zustand";
import { createCatalogActions } from "./scenarioStore/catalogActions.js";
import { createChapterActions } from "./scenarioStore/chapterActions.js";
import { createHistoryActions } from "./scenarioStore/historyActions.js";
import { createProjectActions } from "./scenarioStore/projectActions.js";
import type { ScenarioState } from "./scenarioStore/types.js";

export type { ScenarioState } from "./scenarioStore/types.js";

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
  recentContribution: null,
  validationIssues: [],
  saving: false,
  undoStack: [],
  redoStack: [],

  ...createHistoryActions(set, get),
  ...createProjectActions(set, get),
  ...createChapterActions(set, get),
  ...createCatalogActions(set, get),
}));
