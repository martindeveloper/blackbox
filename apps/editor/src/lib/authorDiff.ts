import type { LoadedBundle } from "./scenarioLoader.js";
import type { ProjectChange, ProjectEvent } from "./projectApi.js";
import type {
  CatalogEntry,
  CharacterDefinition,
  ChoiceContent,
  GameContent,
  ItemDefinition,
  NodeContent,
  TextBlock,
} from "@/types/wire.js";

export type AuthorChangeAction = "added" | "edited" | "removed";

/**
 * How a field should be presented in the review UI. `text` and `code` drive the
 * inline tracked-changes diff (prose vs. monospace); the rest get bespoke,
 * domain-aware renderers (colour swatch, media chip, count delta, value chips).
 */
export type AuthorFieldKind = "text" | "scalar" | "color" | "media" | "count" | "code";

export interface AuthorFieldChange {
  label: string;
  before?: string;
  after?: string;
  kind: AuthorFieldKind;
  media?: "image" | "audio";
}

export interface AuthorChange {
  id: string;
  group: string;
  entity: string;
  title: string;
  action: AuthorChangeAction;
  fields: AuthorFieldChange[];
  locator?: {
    page: "graph" | "items" | "characters" | "assets" | "meta" | "library" | "scenario";
    chapterId?: string;
    nodeId?: string;
    id?: string;
  };
}

export interface AuthorDiff {
  title: string;
  subtitle: string;
  /** Set for single-file reviews; the UI shows it as the change source chip. */
  sourcePath?: string;
  changes: AuthorChange[];
  truncated: boolean;
}

const MAX_CHANGES = 150;

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function text(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function textBlockText(block: unknown): string {
  if (typeof block === "string") return block;
  const maybeText = (block as Partial<TextBlock> | undefined)?.text;
  if (typeof maybeText === "string") return maybeText;
  return text(block);
}

function textBlockLabel(index: number, before: unknown, after: unknown): string {
  const block = (after ?? before) as Partial<TextBlock> | undefined;
  const speaker = typeof block?.speaker === "string" && block.speaker ? ` · ${block.speaker}` : "";
  return `Text block ${index + 1}${speaker}`;
}

function count(value: unknown, singular: string): string {
  const n = Array.isArray(value) ? value.length : 0;
  return `${n} ${singular}${n === 1 ? "" : "s"}`;
}

/** Short single-line value (title, label, destination, mode, …). */
function pushField(
  fields: AuthorFieldChange[],
  label: string,
  before: unknown,
  after: unknown,
  formatter: (value: unknown) => string = text,
): void {
  if (same(before, after)) return;
  fields.push({ label, before: formatter(before), after: formatter(after), kind: "scalar" });
}

/** Author prose — descriptions, examine text — gets word-level tracked changes. */
function pushProse(
  fields: AuthorFieldChange[],
  label: string,
  before: unknown,
  after: unknown,
): void {
  if (same(before, after)) return;
  fields.push({ label, before: text(before), after: text(after), kind: "text" });
}

/** A colour value, rendered as a swatch pair. */
function pushColor(
  fields: AuthorFieldChange[],
  label: string,
  before: unknown,
  after: unknown,
): void {
  if (same(before, after)) return;
  fields.push({ label, before: text(before), after: text(after), kind: "color" });
}

/** A reference to a registered asset, rendered as a media chip. */
function pushMedia(
  fields: AuthorFieldChange[],
  label: string,
  before: unknown,
  after: unknown,
  media: "image" | "audio",
): void {
  if (same(before, after)) return;
  fields.push({ label, before: text(before), after: text(after), kind: "media", media });
}

/** A collection whose size is what matters (effects, choices, actions, …). */
function pushCount(
  fields: AuthorFieldChange[],
  label: string,
  before: unknown,
  after: unknown,
  singular: string,
): void {
  if (same(before, after)) return;
  fields.push({
    label,
    before: count(before, singular),
    after: count(after, singular),
    kind: "count",
  });
}

/** Game-logic / structured data — falls back to a plain monospace diff. */
function pushCode(
  fields: AuthorFieldChange[],
  label: string,
  before: unknown,
  after: unknown,
): void {
  if (same(before, after)) return;
  fields.push({ label, before: text(before), after: text(after), kind: "code" });
}

function pushTextFields(fields: AuthorFieldChange[], before: unknown, after: unknown): void {
  const beforeBlocks = Array.isArray(before) ? before : [];
  const afterBlocks = Array.isArray(after) ? after : [];
  const blockCount = Math.max(beforeBlocks.length, afterBlocks.length);
  for (let index = 0; index < blockCount; index += 1) {
    const beforeBlock = beforeBlocks[index];
    const afterBlock = afterBlocks[index];
    if (same(beforeBlock, afterBlock)) continue;
    fields.push({
      label: textBlockLabel(index, beforeBlock, afterBlock),
      before: textBlockText(beforeBlock),
      after: textBlockText(afterBlock),
      kind: "text",
    });
  }
}

function addChange(changes: AuthorChange[], change: AuthorChange): void {
  if (changes.length < MAX_CHANGES) changes.push(change);
}

function compareRecords<T>(
  changes: AuthorChange[],
  group: string,
  entity: string,
  before: Record<string, T> | undefined,
  after: Record<string, T> | undefined,
  describe: (id: string, value: T | undefined) => string,
  fieldsFor: (beforeValue: T | undefined, afterValue: T | undefined) => AuthorFieldChange[],
  locatorFor?: (id: string) => AuthorChange["locator"],
): void {
  const ids = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const id of [...ids].sort()) {
    const beforeValue = before?.[id];
    const afterValue = after?.[id];
    if (beforeValue && !afterValue) {
      addChange(changes, {
        id: `${group}:${id}:removed`,
        group,
        entity,
        title: describe(id, beforeValue),
        action: "removed",
        fields: [],
        locator: locatorFor?.(id),
      });
      continue;
    }
    if (!beforeValue && afterValue) {
      addChange(changes, {
        id: `${group}:${id}:added`,
        group,
        entity,
        title: describe(id, afterValue),
        action: "added",
        fields: [],
        locator: locatorFor?.(id),
      });
      continue;
    }
    if (!beforeValue || !afterValue || same(beforeValue, afterValue)) continue;
    const fields = fieldsFor(beforeValue, afterValue);
    if (fields.length === 0) continue;
    addChange(changes, {
      id: `${group}:${id}:edited`,
      group,
      entity,
      title: describe(id, afterValue),
      action: "edited",
      fields,
      locator: locatorFor?.(id),
    });
  }
}

function nodeFields(before: NodeContent | undefined, after: NodeContent | undefined) {
  const fields: AuthorFieldChange[] = [];
  pushField(fields, "Title", before?.title, after?.title);
  pushField(fields, "Mode", before?.mode, after?.mode);
  pushMedia(fields, "Background", before?.backgroundRef, after?.backgroundRef, "image");
  pushTextFields(fields, before?.text, after?.text);
  pushCount(fields, "Entry effects", before?.onEnter, after?.onEnter, "effect");
  pushCount(fields, "Choices", before?.choices, after?.choices, "choice");
  return fields;
}

function choiceFields(before: ChoiceContent | undefined, after: ChoiceContent | undefined) {
  const fields: AuthorFieldChange[] = [];
  pushField(fields, "Label", before?.label, after?.label);
  pushField(fields, "Destination", before?.goto, after?.goto);
  pushField(fields, "Action", before?.action, after?.action);
  pushField(fields, "Condition", before?.when ?? before?.requires, after?.when ?? after?.requires);
  pushCount(fields, "Effects", before?.effects, after?.effects, "effect");
  pushCode(fields, "Skill check", before?.check, after?.check);
  return fields;
}

function itemFields(before: ItemDefinition | undefined, after: ItemDefinition | undefined) {
  const fields: AuthorFieldChange[] = [];
  pushField(fields, "Name", before?.name, after?.name);
  pushProse(fields, "Description", before?.description, after?.description);
  pushProse(fields, "Examine text", before?.examineText, after?.examineText);
  pushMedia(fields, "Icon", before?.iconRef, after?.iconRef, "image");
  pushCount(fields, "Actions", before?.actions, after?.actions, "action");
  return fields;
}

function characterFields(
  before: CharacterDefinition | undefined,
  after: CharacterDefinition | undefined,
) {
  const fields: AuthorFieldChange[] = [];
  pushField(fields, "Name", before?.name, after?.name);
  pushField(fields, "Subtitle", before?.subtitle, after?.subtitle);
  pushMedia(fields, "Portrait", before?.portraitRef, after?.portraitRef, "image");
  pushMedia(fields, "Voice", before?.voiceRef, after?.voiceRef, "audio");
  pushColor(fields, "Color", before?.color, after?.color);
  pushCode(fields, "Relationships", before?.relationships, after?.relationships);
  return fields;
}

function catalogFields(before: CatalogEntry | undefined, after: CatalogEntry | undefined) {
  const fields: AuthorFieldChange[] = [];
  pushField(fields, "Title", before?.title, after?.title);
  pushProse(fields, "Description", before?.description, after?.description);
  pushField(fields, "Internal", before?.internal, after?.internal);
  return fields;
}

function chapterFields(
  before: LoadedBundle["chapters"][string] | undefined,
  after: LoadedBundle["chapters"][string] | undefined,
) {
  const fields: AuthorFieldChange[] = [];
  pushField(fields, "Title", before?.title, after?.title);
  pushField(fields, "Start node", before?.startNodeId, after?.startNodeId);
  pushField(fields, "Death node", before?.deathNodeId, after?.deathNodeId);
  return fields;
}

function compareNodes(changes: AuthorChange[], before: LoadedBundle, after: LoadedBundle): void {
  const chapterIds = new Set([...Object.keys(before.chapters), ...Object.keys(after.chapters)]);
  for (const chapterId of [...chapterIds].sort()) {
    const beforeChapter = before.chapters[chapterId];
    const afterChapter = after.chapters[chapterId];
    const group = `Chapter “${afterChapter?.title ?? beforeChapter?.title ?? chapterId}”`;
    const nodeTitle = (id: string, node?: NodeContent) => node?.title || id;
    compareRecords(
      changes,
      group,
      "Node",
      beforeChapter?.nodes,
      afterChapter?.nodes,
      nodeTitle,
      nodeFields,
      (id) => ({ page: "graph", chapterId, nodeId: id }),
    );

    const nodeIds = new Set([
      ...Object.keys(beforeChapter?.nodes ?? {}),
      ...Object.keys(afterChapter?.nodes ?? {}),
    ]);
    for (const nodeId of [...nodeIds].sort()) {
      const beforeNode = beforeChapter?.nodes[nodeId];
      const afterNode = afterChapter?.nodes[nodeId];
      if (!beforeNode || !afterNode) continue;
      compareRecords(
        changes,
        group,
        "Choice",
        Object.fromEntries((beforeNode.choices ?? []).map((choice) => [choice.id, choice])),
        Object.fromEntries((afterNode.choices ?? []).map((choice) => [choice.id, choice])),
        (id, choice) => choice?.label || id,
        choiceFields,
        () => ({ page: "graph", chapterId, nodeId }),
      );
    }
  }
}

function compareBundle(before: LoadedBundle, after: LoadedBundle): AuthorChange[] {
  const changes: AuthorChange[] = [];
  compareRecords(
    changes,
    "Chapters",
    "Chapter",
    before.chapters,
    after.chapters,
    (id, chapter) => chapter?.title || id,
    chapterFields,
    (id) => ({ page: "graph", chapterId: id }),
  );
  compareNodes(changes, before, after);
  compareRecords(
    changes,
    "Items",
    "Item",
    before.items.items,
    after.items.items,
    (id, item) => item?.name || id,
    itemFields,
    (id) => ({ page: "items", id }),
  );
  compareRecords(
    changes,
    "Characters",
    "Character",
    before.characters.characters,
    after.characters.characters,
    (id, character) => character?.name || id,
    characterFields,
    (id) => ({ page: "characters", id }),
  );
  for (const kind of ["music", "sfx", "textures"] as const) {
    compareRecords(
      changes,
      "Assets",
      kind === "textures" ? "Texture" : kind === "music" ? "Music" : "Sound",
      before.assets[kind],
      after.assets[kind],
      (id) => id,
      (a, b) => {
        const fields: AuthorFieldChange[] = [];
        pushField(
          fields,
          "Source",
          (a as { src?: string } | undefined)?.src,
          (b as { src?: string } | undefined)?.src,
        );
        pushField(
          fields,
          "Usage",
          (a as { usage?: string } | undefined)?.usage,
          (b as { usage?: string } | undefined)?.usage,
        );
        return fields;
      },
      (id) => ({ page: "assets", id }),
    );
  }
  compareRecords(
    changes,
    "Events",
    "Event",
    before.meta?.events,
    after.meta?.events,
    (id, entry) => entry?.title || id,
    catalogFields,
    (id) => ({ page: "meta", id }),
  );
  compareRecords(
    changes,
    "Flags",
    "Flag",
    before.meta?.flags,
    after.meta?.flags,
    (id, entry) => entry?.title || id,
    catalogFields,
    (id) => ({ page: "meta", id }),
  );
  return changes;
}

function parseJson(textValue: string): unknown {
  if (!textValue.trim()) return null;
  try {
    return JSON.parse(textValue);
  } catch {
    return undefined;
  }
}

function fileChange(filePath: string, before: string, after: string): AuthorChange {
  return {
    id: `file:${filePath}`,
    group: "Technical file",
    entity: "File",
    title: filePath,
    action: before ? (after ? "edited" : "removed") : "added",
    fields: [{ label: "Contents", before: text(before), after: text(after), kind: "code" }],
  };
}

function changedBundle(
  bundle: LoadedBundle,
  filePath: string,
  beforeValue: unknown,
  afterValue: unknown,
): [LoadedBundle, LoadedBundle] | null {
  const before = structuredClone(bundle);
  const after = structuredClone(bundle);
  const chapterId = Object.entries(bundle.filePaths.chapters).find(
    ([, chapterPath]) => chapterPath === filePath,
  )?.[0];
  if (chapterId) {
    if (beforeValue) before.chapters[chapterId] = beforeValue as LoadedBundle["chapters"][string];
    else delete before.chapters[chapterId];
    if (afterValue) after.chapters[chapterId] = afterValue as LoadedBundle["chapters"][string];
    else delete after.chapters[chapterId];
    return [before, after];
  }
  if (filePath === bundle.filePaths.scenario) {
    before.scenario = (beforeValue ?? {}) as GameContent;
    after.scenario = (afterValue ?? {}) as GameContent;
    return [before, after];
  }
  if (filePath === bundle.filePaths.items) {
    before.items = (beforeValue ?? { items: {} }) as LoadedBundle["items"];
    after.items = (afterValue ?? { items: {} }) as LoadedBundle["items"];
    return [before, after];
  }
  if (filePath === bundle.filePaths.characters) {
    before.characters = (beforeValue ?? { characters: {} }) as LoadedBundle["characters"];
    after.characters = (afterValue ?? { characters: {} }) as LoadedBundle["characters"];
    return [before, after];
  }
  if (filePath === bundle.filePaths.assets) {
    before.assets = (beforeValue ?? { music: {}, sfx: {}, textures: {} }) as LoadedBundle["assets"];
    after.assets = (afterValue ?? { music: {}, sfx: {}, textures: {} }) as LoadedBundle["assets"];
    return [before, after];
  }
  if (filePath === bundle.filePaths.meta) {
    before.meta = (beforeValue ?? null) as LoadedBundle["meta"];
    after.meta = (afterValue ?? null) as LoadedBundle["meta"];
    return [before, after];
  }
  return null;
}

function scenarioFields(before: GameContent | undefined, after: GameContent | undefined) {
  const fields: AuthorFieldChange[] = [];
  pushField(fields, "Title", before?.title, after?.title);
  pushField(fields, "Start node", before?.startNodeId, after?.startNodeId);
  pushField(fields, "Revision", before?.revision, after?.revision);
  pushCount(fields, "Chapters", before?.chapters, after?.chapters, "chapter");
  return fields;
}

export function buildAuthorFileDiff(
  filePath: string,
  beforeText: string,
  afterText: string,
  bundle?: LoadedBundle | null,
): AuthorDiff {
  const beforeValue = parseJson(beforeText);
  const afterValue = parseJson(afterText);
  let changes: AuthorChange[] = [];
  if (bundle && beforeValue !== undefined && afterValue !== undefined) {
    const changed = changedBundle(bundle, filePath, beforeValue, afterValue);
    if (changed) changes = compareBundle(changed[0], changed[1]);
  }
  if (changes.length === 0 && beforeValue !== undefined && afterValue !== undefined) {
    if (
      typeof beforeValue === "object" &&
      typeof afterValue === "object" &&
      (beforeValue || afterValue) &&
      "nodes" in ((beforeValue ?? afterValue) as Record<string, unknown>)
    ) {
      const beforeChapter = { detached: beforeValue as LoadedBundle["chapters"][string] };
      const afterChapter = { detached: afterValue as LoadedBundle["chapters"][string] };
      compareRecords(
        changes,
        "Chapter file",
        "Chapter",
        beforeChapter,
        afterChapter,
        (_id, chapter) => chapter?.title || filePath,
        chapterFields,
      );
      // A chapter file outside the loaded bundle: compareNodes only reads
      // `.chapters`, so a partial bundle stub is enough to diff its nodes.
      compareNodes(
        changes,
        {
          ...({} as LoadedBundle),
          chapters: beforeChapter,
        },
        {
          ...({} as LoadedBundle),
          chapters: afterChapter,
        },
      );
    } else if (
      typeof beforeValue === "object" &&
      typeof afterValue === "object" &&
      (beforeValue || afterValue) &&
      "title" in ((beforeValue ?? afterValue) as Record<string, unknown>)
    ) {
      const fields = scenarioFields(beforeValue as GameContent, afterValue as GameContent);
      if (fields.length > 0) {
        changes = [
          {
            id: `scenario:${filePath}`,
            group: "Scenario",
            entity: "Project",
            title:
              (afterValue as Partial<GameContent> | null)?.title ??
              (beforeValue as Partial<GameContent> | null)?.title ??
              filePath,
            action: beforeText ? (afterText ? "edited" : "removed") : "added",
            fields,
            locator: { page: "scenario" },
          },
        ];
      }
    }
  }
  if (changes.length === 0) changes = [fileChange(filePath, beforeText, afterText)];
  return {
    title: filePath,
    subtitle: `${changes.length} change${changes.length === 1 ? "" : "s"} in this file`,
    sourcePath: filePath,
    changes,
    truncated: changes.length >= MAX_CHANGES,
  };
}

function fallbackChange(change: ProjectChange): AuthorChange {
  const group = change.chapterId ? `Chapter “${change.chapterId}”` : "Project";
  return {
    id: `${change.entity}:${change.chapterId ?? ""}:${change.id}:${change.action}`,
    group,
    entity: change.entity,
    title: change.id,
    action: change.action,
    fields: [],
  };
}

export function buildAuthorDiff(
  event: ProjectEvent,
  before?: LoadedBundle | null,
  after?: LoadedBundle | null,
): AuthorDiff {
  const fallback = (event.contribution?.changes ?? []).map(fallbackChange);
  const semantic = before && after ? compareBundle(before, after) : [];
  const changes = semantic.length > 0 ? semantic : fallback;
  const contributor = event.contribution?.contributor.name ?? "Contributor";
  return {
    title: `${contributor} changed the project`,
    subtitle: `${changes.length} author-facing change${changes.length === 1 ? "" : "s"}`,
    changes,
    truncated: changes.length >= MAX_CHANGES || event.contribution?.changesTruncated === true,
  };
}
