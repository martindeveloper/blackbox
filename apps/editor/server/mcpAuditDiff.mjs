import { isDeepStrictEqual } from "node:util";

const MAX_CHANGES = 100;

export function summarizeDocumentChanges(snapshot, documents) {
  const changes = [];
  for (const [documentPath, after] of Object.entries(documents)) {
    const before = documentForPath(snapshot.bundle, documentPath);
    summarizeDocument(before, after, documentPath, changes);
  }
  return {
    changes: changes.slice(0, MAX_CHANGES),
    changeCount: changes.length,
    changesTruncated: changes.length > MAX_CHANGES,
  };
}

function documentForPath(bundle, documentPath) {
  const paths = bundle.filePaths ?? {};
  if (documentPath === paths.scenario) return bundle.scenario;
  if (documentPath === paths.items) return bundle.items;
  if (documentPath === paths.characters) return bundle.characters;
  if (documentPath === paths.assets) return bundle.assets;
  if (documentPath === paths.meta) return bundle.meta;
  if (documentPath === paths.library) return bundle.library;
  const chapterId = Object.entries(paths.chapters ?? {}).find(
    ([, path]) => path === documentPath,
  )?.[0];
  return chapterId ? bundle.chapters?.[chapterId] : undefined;
}

function summarizeDocument(before, after, documentPath, changes) {
  if (!isObject(after)) return;
  const spec = typeof after.spec === "string" ? after.spec : "";

  if (spec.includes(".chapter") || (after.id && isObject(after.nodes))) {
    summarizeNodes(before?.nodes, after.nodes, String(after.id), changes);
    return;
  }
  if (spec.includes(".items") || isObject(after.items)) {
    summarizeRecords(before?.items, after.items, "item", null, changes);
    return;
  }
  if (spec.includes(".characters") || isObject(after.characters)) {
    summarizeRecords(before?.characters, after.characters, "character", null, changes);
    return;
  }
  if (spec.includes(".catalog") || isObject(after.events) || isObject(after.flags)) {
    summarizeRecords(before?.events, after.events, "event", null, changes);
    summarizeRecords(before?.flags, after.flags, "flag", null, changes);
    return;
  }
  if (spec.includes(".assets") || isObject(after.textures) || isObject(after.music)) {
    summarizeRecords(before?.textures, after.textures, "texture", null, changes);
    summarizeRecords(before?.music, after.music, "music", null, changes);
    summarizeRecords(before?.sfx, after.sfx, "sound", null, changes);
    return;
  }
  if (spec.includes(".library") || isObject(after.snippets) || isObject(after.templates)) {
    summarizeRecords(before?.snippets, after.snippets, "snippet", null, changes);
    summarizeRecords(before?.templates, after.templates, "template", null, changes);
    summarizeRecords(before?.conditions, after.conditions, "condition", null, changes);
    return;
  }
  if (spec.includes(".scenario") || documentPath === "scenario.json") {
    summarizeArrayRecords(before?.chapters, after.chapters, "chapter", changes);
    summarizeNodes(before?.nodes, after.nodes, "scenario", changes);
  }
}

function summarizeNodes(before, after, chapterId, changes) {
  const previous = record(before);
  const next = record(after);
  for (const id of unionKeys(previous, next)) {
    if (!(id in previous)) {
      addChange(changes, "added", "node", id, null, chapterId);
      continue;
    }
    if (!(id in next)) {
      addChange(changes, "removed", "node", id, null, chapterId);
      continue;
    }
    const { choices: beforeChoices, ...beforeNode } = record(previous[id]);
    const { choices: afterChoices, ...afterNode } = record(next[id]);
    if (!isDeepStrictEqual(beforeNode, afterNode)) {
      addChange(changes, "edited", "node", id, null, chapterId);
    }
    summarizeArrayRecords(beforeChoices, afterChoices, "choice", changes, id, chapterId);
  }
}

function summarizeArrayRecords(before, after, entity, changes, parentId = null, chapterId = null) {
  const previous = arrayRecord(before);
  const next = arrayRecord(after);
  summarizeRecords(previous, next, entity, parentId, changes, chapterId);
}

function summarizeRecords(before, after, entity, parentId, changes, chapterId = null) {
  const previous = record(before);
  const next = record(after);
  for (const id of unionKeys(previous, next)) {
    if (!(id in previous)) {
      addChange(changes, "added", entity, id, parentId, chapterId);
    } else if (!(id in next)) {
      addChange(changes, "removed", entity, id, parentId, chapterId);
    } else if (!isDeepStrictEqual(previous[id], next[id])) {
      addChange(changes, "edited", entity, id, parentId, chapterId);
    }
  }
}

function addChange(changes, action, entity, id, parentId = null, chapterId = null) {
  changes.push({
    action,
    entity,
    id: String(id).slice(0, 160),
    ...(parentId ? { parentId: String(parentId).slice(0, 160) } : {}),
    ...(chapterId ? { chapterId: String(chapterId).slice(0, 160) } : {}),
  });
}

function arrayRecord(value) {
  if (!Array.isArray(value)) return {};
  return Object.fromEntries(
    value.map((entry, index) => [
      isObject(entry) && typeof entry.id === "string" ? entry.id : String(index),
      entry,
    ]),
  );
}

function record(value) {
  return isObject(value) ? value : {};
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function unionKeys(left, right) {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
}
