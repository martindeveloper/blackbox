import type { ScenarioGet, ScenarioSet, ScenarioState } from "./types.js";
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
} from "@/lib/projectApi.js";
import { openProjectWithPrompts } from "@/lib/openProjectFlow.js";
import { defaultImportPath } from "@/lib/mediaLibrary.js";
import { translate } from "@/lib/i18n.js";
import { confirmModal } from "@/lib/modalApi.js";
import { notifyError, notifyFromError, notifySuccess } from "@/lib/notifyApi.js";
import { notifyContributionBlocked } from "@/lib/contributionNotifications.js";
import { collectDirtyDocuments } from "@/lib/scenarioWriter.js";
import { validateBundle } from "@/lib/validation.js";
import { presentContribution, pickMediaFile, resetHistory, runtime } from "./helpers.js";

export function createProjectActions(
  set: ScenarioSet,
  get: ScenarioGet,
): Pick<
  ScenarioState,
  | "openProject"
  | "reloadProject"
  | "bootstrapProjectCode"
  | "overwriteConflict"
  | "refreshMediaLibrary"
  | "importMediaFile"
  | "deleteMediaFile"
  | "restoreTrashItem"
  | "permanentlyDeleteTrashItem"
  | "emptyTrash"
  | "save"
  | "markDirty"
> {
  return {
    openProject: async (projectId) => {
      try {
        const snapshot = await openProjectWithPrompts(projectId);
        if (!snapshot) return false;
        runtime.unsubscribeProject?.();
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
          recentContribution: null,
          validationIssues: validateBundle(snapshot.bundle),
          ...resetHistory(),
        });
        runtime.unsubscribeProject = subscribeProject(projectId, (event) => {
          const state = get();
          if (event.contribution?.status === "blocked") {
            notifyContributionBlocked(event);
            return;
          }
          if (event.revision <= (state.revision ?? 0)) {
            if (state.dirty.size === 0 && !state.saving) presentContribution(event, set, get);
            return;
          }
          if (state.dirty.size > 0 || state.saving) {
            set({ conflict: event });
            return;
          }
          void (async () => {
            const reloaded = await get().reloadProject();
            if (reloaded) presentContribution(event, set, get);
          })();
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
  };
}
