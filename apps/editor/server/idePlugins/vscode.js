import {
  ensureVsCodeFamilyProjectSettings,
  VSCODE_FAMILY_GITIGNORE_ENTRIES,
} from "./vscodeFamily.js";

export const vscodePlugin = {
  id: "vscode",
  gitignoreEntries: VSCODE_FAMILY_GITIGNORE_ENTRIES,
  ensureProjectSettings: ensureVsCodeFamilyProjectSettings,
};
