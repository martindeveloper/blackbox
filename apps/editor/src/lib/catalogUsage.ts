import type { Effect } from "@/types/wire.js";
import { Page } from "./pages.js";
import type { MediaCategory } from "./mediaLibrary.js";
import type { LoadedBundle } from "./scenarioLoader.js";

export type CatalogCategory = MediaCategory;

export type CatalogUsageKind =
  | "itemIcon"
  | "characterPortrait"
  | "characterVoice"
  | "nodeBackground"
  | "choiceSfx"
  | "playMusic"
  | "playSfx"
  | "defaultChoiceSfx";

export type CatalogUsageContext =
  | "onEnter"
  | "choice"
  | "choiceSuccess"
  | "choiceFailure"
  | "itemAction";

export interface CatalogUsage {
  kind: CatalogUsageKind;
  itemId?: string;
  characterId?: string;
  chapterId?: string;
  nodeId?: string;
  choiceId?: string;
  actionId?: string;
  context?: CatalogUsageContext;
}

export type CatalogUsageIndex = Map<string, CatalogUsage[]>;

type UsageNavigateTarget = {
  to: Page.EditorItems | Page.EditorCharacters | Page.EditorGraph;
  search: Record<string, string>;
};

export function catalogUsageKey(category: CatalogCategory, assetKey: string): string {
  return `${category}:${assetKey}`;
}

function pushUsage(
  index: CatalogUsageIndex,
  category: CatalogCategory,
  assetKey: string,
  usage: CatalogUsage,
): void {
  const key = catalogUsageKey(category, assetKey);
  const list = index.get(key);
  if (list) list.push(usage);
  else index.set(key, [usage]);
}

function indexEffectAssets(
  index: CatalogUsageIndex,
  chapterId: string | undefined,
  nodeId: string | undefined,
  effects: Effect[] | undefined,
  context: CatalogUsageContext,
  extra?: Pick<CatalogUsage, "choiceId" | "itemId" | "actionId">,
): void {
  for (const effect of effects ?? []) {
    if (effect.type === "playMusic") {
      pushUsage(index, "music", effect.track, {
        kind: "playMusic",
        chapterId,
        nodeId,
        context,
        ...extra,
      });
    }
    if (effect.type === "playSfx") {
      pushUsage(index, "sfx", effect.sfx, {
        kind: "playSfx",
        chapterId,
        nodeId,
        context,
        ...extra,
      });
    }
  }
}

export function buildCatalogUsageIndex(bundle: LoadedBundle): CatalogUsageIndex {
  const index: CatalogUsageIndex = new Map();

  for (const [itemId, item] of Object.entries(bundle.items.items)) {
    if (item.iconRef) pushUsage(index, "textures", item.iconRef, { kind: "itemIcon", itemId });
  }

  for (const [characterId, char] of Object.entries(bundle.characters.characters)) {
    if (char.portraitRef) {
      pushUsage(index, "textures", char.portraitRef, { kind: "characterPortrait", characterId });
    }
    if (char.voiceRef) {
      pushUsage(index, "sfx", char.voiceRef, { kind: "characterVoice", characterId });
    }
  }

  for (const [chapterId, chapter] of Object.entries(bundle.chapters)) {
    for (const [nodeId, node] of Object.entries(chapter.nodes)) {
      if (node.backgroundRef) {
        pushUsage(index, "textures", node.backgroundRef, {
          kind: "nodeBackground",
          chapterId,
          nodeId,
        });
      }

      indexEffectAssets(index, chapterId, nodeId, node.onEnter, "onEnter");
      for (const choice of node.choices ?? []) {
        if (choice.sfx) {
          pushUsage(index, "sfx", choice.sfx, {
            kind: "choiceSfx",
            chapterId,
            nodeId,
            choiceId: choice.id,
          });
        }
        indexEffectAssets(index, chapterId, nodeId, choice.effects, "choice", {
          choiceId: choice.id,
        });
        if (choice.check) {
          indexEffectAssets(
            index,
            chapterId,
            nodeId,
            choice.check.onSuccess.effects,
            "choiceSuccess",
            {
              choiceId: choice.id,
            },
          );
          indexEffectAssets(
            index,
            chapterId,
            nodeId,
            choice.check.onFailure.effects,
            "choiceFailure",
            {
              choiceId: choice.id,
            },
          );
        }
      }
    }
  }

  indexEffectAssets(index, undefined, undefined, bundle.scenario.deathNode?.onEnter, "onEnter");

  for (const item of Object.values(bundle.items.items)) {
    for (const action of item.actions ?? []) {
      indexEffectAssets(index, undefined, undefined, action.effects, "itemAction", {
        itemId: item.id,
        actionId: action.id,
      });
    }
  }

  if (bundle.assets.defaultChoiceSfx) {
    pushUsage(index, "sfx", bundle.assets.defaultChoiceSfx, { kind: "defaultChoiceSfx" });
  }

  for (const list of index.values()) {
    list.sort((a, b) => usageSortKey(a).localeCompare(usageSortKey(b)));
  }

  return index;
}

export function getCatalogUsages(
  index: CatalogUsageIndex,
  category: CatalogCategory,
  assetKey: string,
): CatalogUsage[] {
  return index.get(catalogUsageKey(category, assetKey)) ?? [];
}

export function describeCatalogUsage(
  t: (key: string, opts?: Record<string, string>) => string,
  usage: CatalogUsage,
): { label: string; target: UsageNavigateTarget | null } {
  switch (usage.kind) {
    case "itemIcon":
      return {
        label: t("catalog.usage.itemIcon", { itemId: usage.itemId ?? "" }),
        target: usage.itemId ? { to: Page.EditorItems, search: { item: usage.itemId } } : null,
      };
    case "characterPortrait":
    case "characterVoice":
      return {
        label: t(
          usage.kind === "characterPortrait"
            ? "catalog.usage.characterPortrait"
            : "catalog.usage.characterVoice",
          { characterId: usage.characterId ?? "" },
        ),
        target: usage.characterId
          ? { to: Page.EditorCharacters, search: { character: usage.characterId } }
          : null,
      };
    case "nodeBackground":
      return {
        label: t("catalog.usage.nodeBackground", {
          chapterId: usage.chapterId ?? "",
          nodeId: usage.nodeId ?? "",
        }),
        target:
          usage.chapterId && usage.nodeId
            ? { to: Page.EditorGraph, search: { chapter: usage.chapterId, node: usage.nodeId } }
            : null,
      };
    case "choiceSfx":
      return {
        label: t("catalog.usage.choiceSfx", {
          chapterId: usage.chapterId ?? "",
          nodeId: usage.nodeId ?? "",
          choiceId: usage.choiceId ?? "",
        }),
        target:
          usage.chapterId && usage.nodeId
            ? { to: Page.EditorGraph, search: { chapter: usage.chapterId, node: usage.nodeId } }
            : null,
      };
    case "playMusic": {
      const contextLabel = usage.context
        ? t(`catalog.usage.context.${usage.context}`, {
            choiceId: usage.choiceId ?? "",
            itemId: usage.itemId ?? "",
            actionId: usage.actionId ?? "",
          })
        : "";
      return {
        label:
          usage.chapterId && usage.nodeId
            ? t("catalog.usage.playMusic", {
                chapterId: usage.chapterId,
                nodeId: usage.nodeId,
                context: contextLabel,
              })
            : t("catalog.usage.playMusicContext", { context: contextLabel }),
        target:
          usage.chapterId && usage.nodeId
            ? { to: Page.EditorGraph, search: { chapter: usage.chapterId, node: usage.nodeId } }
            : null,
      };
    }
    case "playSfx": {
      const contextLabel = usage.context
        ? t(`catalog.usage.context.${usage.context}`, {
            choiceId: usage.choiceId ?? "",
            itemId: usage.itemId ?? "",
            actionId: usage.actionId ?? "",
          })
        : "";
      return {
        label:
          usage.chapterId && usage.nodeId
            ? t("catalog.usage.playSfx", {
                chapterId: usage.chapterId,
                nodeId: usage.nodeId,
                context: contextLabel,
              })
            : t("catalog.usage.playSfxContext", { context: contextLabel }),
        target:
          usage.chapterId && usage.nodeId
            ? { to: Page.EditorGraph, search: { chapter: usage.chapterId, node: usage.nodeId } }
            : null,
      };
    }
    case "defaultChoiceSfx":
      return { label: t("catalog.usage.defaultChoiceSfx"), target: null };
  }
}

function usageSortKey(usage: CatalogUsage): string {
  return [
    usage.kind,
    usage.chapterId ?? "",
    usage.nodeId ?? "",
    usage.itemId ?? "",
    usage.characterId ?? "",
    usage.choiceId ?? "",
    usage.actionId ?? "",
    usage.context ?? "",
  ].join("\0");
}
