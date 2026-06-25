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
import { translate } from "./i18n.ts";

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

const fld = (key: string) => translate(`review.authorDiff.fields.${key}`);
const ent = (key: string) => translate(`review.authorDiff.entities.${key}`);
const grp = (key: string, options?: Record<string, unknown>) =>
  translate(`review.authorDiff.groups.${key}`, options);

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function text(value: unknown): string {
  if (value === undefined || value === null || value === "") return translate("common.emptyDash");
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
  const speaker =
    typeof block?.speaker === "string" && block.speaker
      ? translate("review.authorDiff.textBlockSpeaker", { speaker: block.speaker })
      : "";
  return translate("review.authorDiff.textBlock", { index: index + 1, speaker });
}

function count(value: unknown, singularKey: string): string {
  const n = Array.isArray(value) ? value.length : 0;
  return translate(`review.authorDiff.count.${singularKey}`, { count: n });
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
  pushField(fields, fld("title"), before?.title, after?.title);
  pushField(fields, fld("mode"), before?.mode, after?.mode);
  pushMedia(fields, fld("background"), before?.backgroundRef, after?.backgroundRef, "image");
  pushTextFields(fields, before?.text, after?.text);
  pushCount(fields, fld("entryEffects"), before?.onEnter, after?.onEnter, "effect");
  pushCount(fields, fld("choices"), before?.choices, after?.choices, "choice");
  return fields;
}

function choiceFields(before: ChoiceContent | undefined, after: ChoiceContent | undefined) {
  const fields: AuthorFieldChange[] = [];
  pushField(fields, fld("label"), before?.label, after?.label);
  pushField(fields, fld("destination"), before?.goto, after?.goto);
  pushField(fields, fld("action"), before?.action, after?.action);
  pushField(
    fields,
    fld("condition"),
    before?.when ?? before?.requires,
    after?.when ?? after?.requires,
  );
  pushCount(fields, fld("effects"), before?.effects, after?.effects, "effect");
  pushCode(fields, fld("skillCheck"), before?.check, after?.check);
  return fields;
}

function itemFields(before: ItemDefinition | undefined, after: ItemDefinition | undefined) {
  const fields: AuthorFieldChange[] = [];
  pushField(fields, fld("name"), before?.name, after?.name);
  pushProse(fields, fld("description"), before?.description, after?.description);
  pushProse(fields, fld("examineText"), before?.examineText, after?.examineText);
  pushMedia(fields, fld("icon"), before?.iconRef, after?.iconRef, "image");
  pushCount(fields, fld("actions"), before?.actions, after?.actions, "action");
  return fields;
}

function characterFields(
  before: CharacterDefinition | undefined,
  after: CharacterDefinition | undefined,
) {
  const fields: AuthorFieldChange[] = [];
  pushField(fields, fld("name"), before?.name, after?.name);
  pushField(fields, fld("subtitle"), before?.subtitle, after?.subtitle);
  pushMedia(fields, fld("portrait"), before?.portraitRef, after?.portraitRef, "image");
  pushMedia(fields, fld("voice"), before?.voiceRef, after?.voiceRef, "audio");
  pushColor(fields, fld("color"), before?.color, after?.color);
  pushCode(fields, fld("relationships"), before?.relationships, after?.relationships);
  return fields;
}

function catalogFields(before: CatalogEntry | undefined, after: CatalogEntry | undefined) {
  const fields: AuthorFieldChange[] = [];
  pushField(fields, fld("title"), before?.title, after?.title);
  pushProse(fields, fld("description"), before?.description, after?.description);
  pushField(fields, fld("internal"), before?.internal, after?.internal);
  return fields;
}

function chapterFields(
  before: LoadedBundle["chapters"][string] | undefined,
  after: LoadedBundle["chapters"][string] | undefined,
) {
  const fields: AuthorFieldChange[] = [];
  pushField(fields, fld("title"), before?.title, after?.title);
  pushField(fields, fld("startNode"), before?.startNodeId, after?.startNodeId);
  pushField(fields, fld("deathNode"), before?.deathNodeId, after?.deathNodeId);
  return fields;
}

function compareNodes(changes: AuthorChange[], before: LoadedBundle, after: LoadedBundle): void {
  const chapterIds = new Set([...Object.keys(before.chapters), ...Object.keys(after.chapters)]);
  for (const chapterId of [...chapterIds].sort()) {
    const beforeChapter = before.chapters[chapterId];
    const afterChapter = after.chapters[chapterId];
    const group = grp("chapterNamed", {
      title: afterChapter?.title ?? beforeChapter?.title ?? chapterId,
    });
    const nodeTitle = (id: string, node?: NodeContent) => node?.title || id;
    compareRecords(
      changes,
      group,
      ent("node"),
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
        ent("choice"),
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
    grp("chapters"),
    ent("chapter"),
    before.chapters,
    after.chapters,
    (id, chapter) => chapter?.title || id,
    chapterFields,
    (id) => ({ page: "graph", chapterId: id }),
  );
  compareNodes(changes, before, after);
  compareRecords(
    changes,
    grp("items"),
    ent("item"),
    before.items.items,
    after.items.items,
    (id, item) => item?.name || id,
    itemFields,
    (id) => ({ page: "items", id }),
  );
  compareRecords(
    changes,
    grp("characters"),
    ent("character"),
    before.characters.characters,
    after.characters.characters,
    (id, character) => character?.name || id,
    characterFields,
    (id) => ({ page: "characters", id }),
  );
  for (const kind of ["music", "sfx", "textures"] as const) {
    const assetEntity =
      kind === "textures" ? ent("texture") : kind === "music" ? ent("music") : ent("sound");
    compareRecords(
      changes,
      grp("assets"),
      assetEntity,
      before.assets[kind],
      after.assets[kind],
      (id) => id,
      (a, b) => {
        const fields: AuthorFieldChange[] = [];
        pushField(
          fields,
          fld("source"),
          (a as { src?: string } | undefined)?.src,
          (b as { src?: string } | undefined)?.src,
        );
        pushField(
          fields,
          fld("usage"),
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
    grp("events"),
    ent("event"),
    before.meta?.events,
    after.meta?.events,
    (id, entry) => entry?.title || id,
    catalogFields,
    (id) => ({ page: "meta", id }),
  );
  compareRecords(
    changes,
    grp("flags"),
    ent("flag"),
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
    group: grp("technicalFile"),
    entity: ent("file"),
    title: filePath,
    action: before ? (after ? "edited" : "removed") : "added",
    fields: [{ label: fld("contents"), before: text(before), after: text(after), kind: "code" }],
  };
}

export function buildUndiffableFileDiff(
  filePath: string,
  {
    binary = false,
    tooLarge = false,
    beforeSize = 0,
    afterSize = 0,
  }: { binary?: boolean; tooLarge?: boolean; beforeSize?: number; afterSize?: number } = {},
): AuthorDiff {
  const reason = binary
    ? translate("review.authorDiff.undiffable.binary")
    : tooLarge
      ? translate("review.authorDiff.undiffable.tooLarge")
      : translate("review.authorDiff.undiffable.notText");
  const size = Math.max(beforeSize, afterSize);
  const sizeLabel = size > 0 ? ` Size: ${Math.ceil(size / 1024)} KB.` : "";
  return {
    title: filePath,
    subtitle: translate("review.authorDiff.undiffable.subtitle"),
    sourcePath: filePath,
    changes: [
      {
        id: `file:${filePath}:undiffable`,
        group: grp("technicalFile"),
        entity: ent("file"),
        title: filePath,
        action: beforeSize > 0 ? (afterSize > 0 ? "edited" : "removed") : "added",
        fields: [
          {
            label: fld("contents"),
            before: reason,
            after: `${reason}${sizeLabel}`,
            kind: "scalar",
          },
        ],
      },
    ],
    truncated: false,
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
  pushField(fields, fld("title"), before?.title, after?.title);
  pushField(fields, fld("startNode"), before?.startNodeId, after?.startNodeId);
  pushField(fields, fld("revision"), before?.revision, after?.revision);
  pushCount(fields, fld("chapters"), before?.chapters, after?.chapters, "chapter");
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
        grp("chapterFile"),
        ent("chapter"),
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
            group: grp("scenario"),
            entity: ent("project"),
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
    subtitle: translate("review.authorDiff.fileChangeCount", { count: changes.length }),
    sourcePath: filePath,
    changes,
    truncated: changes.length >= MAX_CHANGES,
  };
}

function fallbackChange(change: ProjectChange): AuthorChange {
  const group = change.chapterId
    ? grp("chapterById", { id: change.chapterId })
    : grp("project");
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
  const contributor =
    event.contribution?.contributor.name ?? translate("review.authorDiff.contributorFallback");
  return {
    title: translate("review.authorDiff.contributorChangedTitle", { contributor }),
    subtitle: translate("review.authorDiff.changeCount", { count: changes.length }),
    changes,
    truncated: changes.length >= MAX_CHANGES || event.contribution?.changesTruncated === true,
  };
}
