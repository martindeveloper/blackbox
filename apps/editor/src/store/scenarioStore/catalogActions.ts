import type { ScenarioGet, ScenarioSet, ScenarioState } from "./types.js";
import { translate } from "@/lib/i18n.js";
import { notifyError, notifySuccess } from "@/lib/notifyApi.js";
import { deleteCatalogEntry } from "@/lib/catalogDelete.js";
import { renameCatalogEntry } from "@/lib/catalogRename.js";
import { renameMetaEntry } from "@/lib/metaRename.js";
import type { Gate } from "@/types/wire.js";
import { cloneBundle, resetHistory, runtime } from "./helpers.js";
import { validateBundle } from "@/lib/validation.js";

export function createCatalogActions(
  set: ScenarioSet,
  get: ScenarioGet,
): Pick<
  ScenarioState,
  | "updateItem"
  | "addItem"
  | "deleteItem"
  | "updateCharacter"
  | "addCharacter"
  | "deleteCharacter"
  | "updateAssets"
  | "renameAssetEntry"
  | "deleteAssetEntry"
  | "updateMetaEntry"
  | "addMetaEntry"
  | "deleteMetaEntry"
  | "renameMetaEntry"
  | "updateLibrarySnippet"
  | "updateLibraryTemplate"
  | "addLibrarySnippet"
  | "addLibraryTemplate"
  | "deleteLibrarySnippet"
  | "deleteLibraryTemplate"
  | "updateLibraryCondition"
  | "addLibraryCondition"
  | "deleteLibraryCondition"
  | "updateGlobalDeathNode"
  | "deleteGlobalDeathNode"
  | "runValidation"
  | "closeFolder"
> {
  return {
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
      runtime.unsubscribeProject?.();
      runtime.unsubscribeProject = null;
      if (runtime.contributionTimer) clearTimeout(runtime.contributionTimer);
      runtime.contributionTimer = null;
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
        recentContribution: null,
        validationIssues: [],
        ...resetHistory(),
      });
    },
  };
}
