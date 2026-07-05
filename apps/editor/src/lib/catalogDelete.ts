import type { Effect, SkillCheckContent } from "@/types/wire.js";
import { entriesForCategory } from "./catalogHealth.js";
import type { CatalogCategory } from "./catalogUsage.js";
import type { LoadedBundle } from "./scenarioLoader.js";

export type CatalogRefReplacement = { mode: "replace"; replacementKey: string } | { mode: "unset" };

function rewriteEffects(
  effects: Effect[] | undefined,
  category: CatalogCategory,
  assetKey: string,
  replacement: CatalogRefReplacement,
): Effect[] | undefined {
  if (!effects?.length) return effects;
  let changed = false;
  const next = effects.flatMap((effect) => {
    if (effect.type === "playMusic" && category === "music" && effect.track === assetKey) {
      changed = true;
      if (replacement.mode === "replace") {
        return [{ ...effect, track: replacement.replacementKey }];
      }
      return [];
    }
    if (effect.type === "playSfx" && category === "sfx" && effect.sfx === assetKey) {
      changed = true;
      if (replacement.mode === "replace") {
        return [{ ...effect, sfx: replacement.replacementKey }];
      }
      return [];
    }
    return [effect];
  });
  if (!changed) return effects;
  return next.length > 0 ? next : undefined;
}

function rewriteCheck(
  check: SkillCheckContent,
  category: CatalogCategory,
  assetKey: string,
  replacement: CatalogRefReplacement,
): SkillCheckContent | undefined {
  let changed = false;
  const next: SkillCheckContent = { ...check };

  if (check.onSuccess) {
    const effects = rewriteEffects(check.onSuccess.effects, category, assetKey, replacement);
    if (effects !== check.onSuccess.effects) {
      next.onSuccess = { ...check.onSuccess, effects };
      changed = true;
    }
  }
  if (check.onFailure) {
    const effects = rewriteEffects(check.onFailure.effects, category, assetKey, replacement);
    if (effects !== check.onFailure.effects) {
      next.onFailure = { ...check.onFailure, effects };
      changed = true;
    }
  }
  if (check.onExhausted) {
    const effects = rewriteEffects(check.onExhausted.effects, category, assetKey, replacement);
    if (effects !== check.onExhausted.effects) {
      next.onExhausted = { ...check.onExhausted, effects };
      changed = true;
    }
  }
  if (check.outcomes?.length) {
    let tiersChanged = false;
    const outcomes = check.outcomes.map((tier) => {
      const effects = rewriteEffects(tier.effects, category, assetKey, replacement);
      if (effects === tier.effects) return tier;
      tiersChanged = true;
      return { ...tier, effects };
    });
    if (tiersChanged) {
      next.outcomes = outcomes;
      changed = true;
    }
  }

  return changed ? next : undefined;
}

function replaceOrUnsetRef(
  current: string | undefined,
  assetKey: string,
  replacement: CatalogRefReplacement,
): string | undefined {
  if (current !== assetKey) return current;
  return replacement.mode === "replace" ? replacement.replacementKey : undefined;
}

export function rewriteCatalogRefs(
  bundle: LoadedBundle,
  category: CatalogCategory,
  assetKey: string,
  replacement: CatalogRefReplacement,
): Set<string> {
  const dirty = new Set<string>();

  for (const [itemId, item] of Object.entries(bundle.items.items)) {
    if (category !== "textures" || !item.iconRef || item.iconRef !== assetKey) continue;
    const iconRef = replaceOrUnsetRef(item.iconRef, assetKey, replacement);
    bundle.items.items[itemId] = { ...item, iconRef };
    dirty.add("items");
  }

  for (const [characterId, char] of Object.entries(bundle.characters.characters)) {
    let next = char;
    if (category === "textures" && char.portraitRef === assetKey) {
      next = { ...next, portraitRef: replaceOrUnsetRef(char.portraitRef, assetKey, replacement) };
      dirty.add("characters");
    }
    if (category === "sfx" && char.voiceRef === assetKey) {
      next = { ...next, voiceRef: replaceOrUnsetRef(char.voiceRef, assetKey, replacement) };
      dirty.add("characters");
    }
    if (next !== char) bundle.characters.characters[characterId] = next;
  }

  for (const [chapterId, chapter] of Object.entries(bundle.chapters)) {
    let chapterDirty = false;
    for (const [nodeId, node] of Object.entries(chapter.nodes)) {
      let next = node;

      if (category === "textures" && node.backgroundRef === assetKey) {
        next = {
          ...next,
          backgroundRef: replaceOrUnsetRef(node.backgroundRef, assetKey, replacement),
        };
        chapterDirty = true;
      }

      const onEnter = rewriteEffects(node.onEnter, category, assetKey, replacement);
      if (onEnter !== node.onEnter) {
        next = { ...next, onEnter };
        chapterDirty = true;
      }

      let choicesDirty = false;
      const choices = node.choices?.map((choice) => {
        let nextChoice = choice;
        if (category === "sfx" && choice.sfx === assetKey) {
          nextChoice = {
            ...nextChoice,
            sfx: replaceOrUnsetRef(choice.sfx, assetKey, replacement),
          };
        }

        const effects = rewriteEffects(choice.effects, category, assetKey, replacement);
        if (effects !== choice.effects) nextChoice = { ...nextChoice, effects };

        if (choice.check) {
          const nextCheck = rewriteCheck(choice.check, category, assetKey, replacement);
          if (nextCheck) nextChoice = { ...nextChoice, check: nextCheck };
        }

        if (nextChoice !== choice) choicesDirty = true;
        return nextChoice;
      });

      if (choices && choicesDirty) {
        next = { ...next, choices };
        chapterDirty = true;
      }

      if (next !== node) chapter.nodes[nodeId] = next;
    }
    if (chapterDirty) dirty.add(`chapter:${chapterId}`);
  }

  for (const [itemId, item] of Object.entries(bundle.items.items)) {
    let actionsDirty = false;
    const actions = item.actions?.map((action) => {
      const effects = rewriteEffects(action.effects, category, assetKey, replacement);
      if (effects === action.effects) return action;
      actionsDirty = true;
      return { ...action, effects };
    });
    if (actions && actionsDirty) {
      bundle.items.items[itemId] = { ...item, actions };
      dirty.add("items");
    }
  }

  if (bundle.scenario.hooks) {
    const onCommand = rewriteEffects(
      bundle.scenario.hooks.onCommand,
      category,
      assetKey,
      replacement,
    );
    const onNodeEnter = rewriteEffects(
      bundle.scenario.hooks.onNodeEnter,
      category,
      assetKey,
      replacement,
    );
    if (
      onCommand !== bundle.scenario.hooks.onCommand ||
      onNodeEnter !== bundle.scenario.hooks.onNodeEnter
    ) {
      bundle.scenario.hooks = { ...bundle.scenario.hooks, onCommand, onNodeEnter };
      dirty.add("scenario");
    }
  }

  if (category === "sfx" && bundle.assets.defaultChoiceSfx === assetKey) {
    bundle.assets.defaultChoiceSfx =
      replacement.mode === "replace" ? replacement.replacementKey : undefined;
    dirty.add("assets");
  }

  return dirty;
}

export function deleteCatalogEntry(
  bundle: LoadedBundle,
  category: CatalogCategory,
  assetKey: string,
  replacement: CatalogRefReplacement | null,
): { dirtyKeys: Set<string> } {
  const dirtyKeys = replacement
    ? rewriteCatalogRefs(bundle, category, assetKey, replacement)
    : new Set<string>();

  const entries = { ...entriesForCategory(bundle.assets, category) };
  delete entries[assetKey];

  if (category === "textures") bundle.assets.textures = entries;
  else if (category === "music") bundle.assets.music = entries;
  else bundle.assets.sfx = entries;

  dirtyKeys.add("assets");
  return { dirtyKeys };
}
