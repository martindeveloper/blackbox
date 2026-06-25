import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  FileJson2,
  FileText,
  Flag,
  Image,
  Music,
  Package,
  Sparkles,
  Split,
  User,
  Volume2,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button.js";
import { Icon } from "@/components/icons/Icon.js";
import { ModalShell } from "@/components/overlay/ModalShell.js";
import {
  AUTHOR_CHANGE_REVIEW_EVENT,
  type AuthorChangeReviewPayload,
} from "@/lib/authorChangeReview.js";
import type {
  AuthorChange,
  AuthorChangeAction,
  AuthorDiff,
  AuthorFieldChange,
} from "@/lib/authorDiff.js";
import { Page } from "@/lib/pages.js";
import { editorNavigate, navigateToCatalogEntry, navigateToMetaEntry } from "@/lib/routeHelpers.js";
import type { MediaCategory } from "@/lib/mediaLibrary.js";

type EditorNavigate = ReturnType<typeof useNavigate>;

function mediaCategoryForEntity(entity: string): MediaCategory {
  if (entity === "Music") return "music";
  if (entity === "Sound") return "sfx";
  return "textures";
}

/** Map a change's domain locator onto the editor's URL so authors land on the
 * exact node / item / character / asset that changed. */
function openChangeLocation(navigate: EditorNavigate, change: AuthorChange): void {
  const locator = change.locator;
  if (!locator) return;
  switch (locator.page) {
    case "graph":
      void editorNavigate(navigate, {
        to: Page.EditorGraph,
        search: { chapter: locator.chapterId ?? null, node: locator.nodeId ?? null },
      });
      break;
    case "items":
      void editorNavigate(navigate, { to: Page.EditorItems, search: { item: locator.id ?? null } });
      break;
    case "characters":
      void editorNavigate(navigate, {
        to: Page.EditorCharacters,
        search: { character: locator.id ?? null },
      });
      break;
    case "assets":
      void navigateToCatalogEntry(
        navigate,
        mediaCategoryForEntity(change.entity),
        locator.id ?? null,
      );
      break;
    case "meta":
      void navigateToMetaEntry(
        navigate,
        change.entity === "Flag" ? "flag" : "event",
        locator.id ?? null,
      );
      break;
    case "scenario":
      void editorNavigate(navigate, { to: Page.EditorManifest });
      break;
    case "library":
      void editorNavigate(navigate, {
        to: Page.EditorLibrary,
        search: { libraryEntry: locator.id ?? null },
      });
      break;
  }
}

const EMPTY_VALUE = "—";

const entityIcon: Record<string, LucideIcon> = {
  Node: Workflow,
  Choice: Split,
  Item: Package,
  Character: User,
  Texture: Image,
  Music: Music,
  Sound: Volume2,
  Event: Sparkles,
  Flag: Flag,
  Chapter: BookOpen,
  Project: FileText,
  File: FileJson2,
};

function iconForEntity(entity: string): LucideIcon {
  return entityIcon[entity] ?? FileText;
}

type UnifiedType = "same" | "add" | "remove";

interface UnifiedToken {
  value: string;
  type: UnifiedType;
}

function splitDiffTokens(value: string, mode: "text" | "code"): string[] {
  if (mode === "text" && value.length <= 2_000) return Array.from(value);
  if (value.includes("\n")) {
    const tokens = value.match(/[^\n]*\n|[^\n]+/g);
    return tokens ?? [value];
  }
  const tokens = value.match(/\s+|[^\s]+/g);
  return tokens ?? [value];
}

function compactUnified(tokens: UnifiedToken[]): UnifiedToken[] {
  const compact: UnifiedToken[] = [];
  for (const token of tokens) {
    const previous = compact.at(-1);
    if (previous && previous.type === token.type) previous.value += token.value;
    else compact.push({ ...token });
  }
  return compact;
}

/**
 * Word/character-level diff rendered as a single inline stream (tracked-changes
 * style) rather than two side-by-side columns: deletions then insertions, in
 * reading order, so prose edits read like a marked-up manuscript.
 */
function diffUnified(before = "", after = "", mode: "text" | "code" = "code"): UnifiedToken[] {
  if (before === after) return before ? [{ value: before, type: "same" }] : [];

  const beforeTokens = splitDiffTokens(before, mode);
  const afterTokens = splitDiffTokens(after, mode);
  const tokenBudget = mode === "text" ? 1_500_000 : 20_000;
  if (beforeTokens.length * afterTokens.length > tokenBudget) {
    const out: UnifiedToken[] = [];
    if (before) out.push({ value: before, type: "remove" });
    if (after) out.push({ value: after, type: "add" });
    return out;
  }

  const columnCount = afterTokens.length + 1;
  const lengths = new Uint32Array((beforeTokens.length + 1) * columnCount);
  const score = (row: number, column: number) => lengths[row * columnCount + column] ?? 0;
  const setScore = (row: number, column: number, value: number) => {
    lengths[row * columnCount + column] = value;
  };
  for (let i = beforeTokens.length - 1; i >= 0; i -= 1) {
    for (let j = afterTokens.length - 1; j >= 0; j -= 1) {
      setScore(
        i,
        j,
        beforeTokens[i] === afterTokens[j]
          ? score(i + 1, j + 1) + 1
          : Math.max(score(i + 1, j), score(i, j + 1)),
      );
    }
  }

  const out: UnifiedToken[] = [];
  let i = 0;
  let j = 0;
  while (i < beforeTokens.length || j < afterTokens.length) {
    const beforeToken = beforeTokens[i];
    const afterToken = afterTokens[j];
    if (beforeToken !== undefined && afterToken !== undefined && beforeToken === afterToken) {
      out.push({ value: beforeToken, type: "same" });
      i += 1;
      j += 1;
    } else if (
      beforeToken !== undefined &&
      (j === afterTokens.length || score(i + 1, j) >= score(i, j + 1))
    ) {
      out.push({ value: beforeToken, type: "remove" });
      i += 1;
    } else if (afterToken !== undefined) {
      out.push({ value: afterToken, type: "add" });
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }
  return compactUnified(out);
}

function groupChanges(changes: AuthorChange[]): Array<[string, AuthorChange[]]> {
  const groups = new Map<string, AuthorChange[]>();
  for (const change of changes) {
    const group = groups.get(change.group) ?? [];
    group.push(change);
    groups.set(change.group, group);
  }
  return [...groups.entries()];
}

function EntityBadge({
  entity,
  action,
  size = "sm",
}: {
  entity: string;
  action: AuthorChangeAction;
  size?: "sm" | "lg";
}) {
  return (
    <span className={`pr-badge pr-badge--${action} pr-badge--${size}`}>
      <Icon icon={iconForEntity(entity)} size={size === "lg" ? 16 : 13} />
    </span>
  );
}

function ActionPill({ action }: { action: AuthorChangeAction }) {
  const { t } = useTranslation();
  return <span className={`pr-pill pr-pill--${action}`}>{t(`review.${action}`)}</span>;
}

function ChangeList({
  diff,
  selectedId,
  onSelect,
}: {
  diff: AuthorDiff;
  selectedId: string | null;
  onSelect: (change: AuthorChange) => void;
}) {
  const groups = useMemo(() => groupChanges(diff.changes), [diff.changes]);
  const { t } = useTranslation();
  return (
    <nav className="project-review-list" aria-label={t("review.changeList")}>
      {groups.map(([group, changes]) => (
        <section key={group}>
          <h3>{group}</h3>
          {changes.map((change) => (
            <button
              key={change.id}
              type="button"
              className={selectedId === change.id ? "is-active" : ""}
              aria-current={selectedId === change.id}
              onClick={() => onSelect(change)}
            >
              <EntityBadge entity={change.entity} action={change.action} />
              <span className="project-review-list-text">
                <strong>{change.title}</strong>
                <small>{change.entity}</small>
              </span>
              <span className={`pr-dot pr-dot--${change.action}`} aria-hidden />
            </button>
          ))}
        </section>
      ))}
    </nav>
  );
}

/** Shared old → new layout used by every non-prose field renderer. */
function ChangeRow({
  before,
  after,
  renderValue,
}: {
  before: string;
  after: string;
  renderValue: (value: string, side: "old" | "new") => ReactNode;
}) {
  const { t } = useTranslation();
  const hasBefore = before !== EMPTY_VALUE;
  const hasAfter = after !== EMPTY_VALUE;
  return (
    <p className="pr-scalar">
      {hasBefore ? renderValue(before, "old") : null}
      {hasBefore && hasAfter ? (
        <Icon icon={ArrowRight} size={13} className="pr-scalar-arrow" />
      ) : null}
      {hasAfter ? renderValue(after, "new") : null}
      {!hasAfter ? <span className="pr-tag pr-tag--removed">{t("review.removed")}</span> : null}
      {!hasBefore ? <span className="pr-tag pr-tag--added">{t("review.added")}</span> : null}
    </p>
  );
}

function ScalarChange({ field }: { field: AuthorFieldChange }) {
  return (
    <ChangeRow
      before={field.before ?? EMPTY_VALUE}
      after={field.after ?? EMPTY_VALUE}
      renderValue={(value, side) => (
        <span key={side} className={side === "old" ? "pr-scalar-old" : "pr-scalar-new"}>
          {value}
        </span>
      )}
    />
  );
}

function ColorChange({ field }: { field: AuthorFieldChange }) {
  return (
    <ChangeRow
      before={field.before ?? EMPTY_VALUE}
      after={field.after ?? EMPTY_VALUE}
      renderValue={(value, side) => (
        <span key={side} className={`pr-chip${side === "old" ? " pr-chip--old" : ""}`}>
          <span className="pr-swatch" style={{ background: value }} aria-hidden />
          <code>{value}</code>
        </span>
      )}
    />
  );
}

function MediaChange({ field }: { field: AuthorFieldChange }) {
  const glyph = field.media === "audio" ? Volume2 : Image;
  return (
    <ChangeRow
      before={field.before ?? EMPTY_VALUE}
      after={field.after ?? EMPTY_VALUE}
      renderValue={(value, side) => (
        <span key={side} className={`pr-chip${side === "old" ? " pr-chip--old" : ""}`}>
          <Icon icon={glyph} size={13} />
          <span className="pr-chip-label">{value}</span>
        </span>
      )}
    />
  );
}

function parseCount(value: string): number | null {
  const match = /^(-?\d+)/.exec(value);
  return match ? Number(match[1]) : null;
}

function CountChange({ field }: { field: AuthorFieldChange }) {
  const before = field.before ?? EMPTY_VALUE;
  const after = field.after ?? EMPTY_VALUE;
  const beforeN = parseCount(before);
  const afterN = parseCount(after);
  if (beforeN === null || afterN === null) return <ScalarChange field={field} />;
  const noun = (after.replace(/^-?\d+\s*/, "") || before.replace(/^-?\d+\s*/, "")).trim();
  const delta = afterN - beforeN;
  return (
    <p className="pr-scalar pr-count-row">
      <span className="pr-count-num pr-count-num--old">{beforeN}</span>
      <Icon icon={ArrowRight} size={13} className="pr-scalar-arrow" />
      <span className="pr-count-num">{afterN}</span>
      {noun ? <span className="pr-count-noun">{noun}</span> : null}
      {delta !== 0 ? (
        <span className={`pr-tag pr-tag--${delta > 0 ? "added" : "removed"}`}>
          {delta > 0 ? `+${delta}` : delta}
        </span>
      ) : null}
    </p>
  );
}

function UnifiedDiff({ field, mode }: { field: AuthorFieldChange; mode: "text" | "code" }) {
  const tokens = useMemo(
    () => diffUnified(field.before, field.after, mode),
    [field.before, field.after, mode],
  );
  return (
    <p className={mode === "text" ? "pr-prose" : "pr-code"}>
      {tokens.map((token, index) => (
        <span
          key={`${index}:${token.value}`}
          className={token.type === "same" ? undefined : `pr-ins pr-ins--${token.type}`}
        >
          {token.value}
        </span>
      ))}
    </p>
  );
}

function FieldBody({ field }: { field: AuthorFieldChange }) {
  switch (field.kind) {
    case "text":
      return <UnifiedDiff field={field} mode="text" />;
    case "code":
      return <UnifiedDiff field={field} mode="code" />;
    case "color":
      return <ColorChange field={field} />;
    case "media":
      return <MediaChange field={field} />;
    case "count":
      return <CountChange field={field} />;
    case "scalar":
    default:
      return <ScalarChange field={field} />;
  }
}

function FieldDiff({ field }: { field: AuthorFieldChange }) {
  return (
    <div className="pr-field">
      <div className="pr-field-label">{field.label}</div>
      <FieldBody field={field} />
    </div>
  );
}

function emptyChangeText(change: AuthorChange, t: (key: string) => string): string {
  if (change.action === "added") return t("review.newRecord");
  if (change.action === "removed") return t("review.removedRecord");
  return t("review.noFieldDetails");
}

function ChangeDetail({
  change,
  onOpen,
}: {
  change: AuthorChange | null;
  onOpen: (change: AuthorChange) => void;
}) {
  const { t } = useTranslation();
  if (!change) {
    return (
      <div className="project-review-empty">
        <Icon icon={Check} size={20} />
        <span>{t("review.noDetails")}</span>
      </div>
    );
  }

  return (
    <section className="project-review-detail" aria-live="polite">
      <header>
        <EntityBadge entity={change.entity} action={change.action} size="lg" />
        <div>
          <span className="project-review-detail-crumb">{change.group}</span>
          <h3>{change.title}</h3>
        </div>
        <div className="project-review-detail-meta">
          <ActionPill action={change.action} />
          {change.locator ? (
            <Button
              variant="default"
              size="sm"
              leadingIcon={ArrowUpRight}
              onClick={() => onOpen(change)}
            >
              {t("review.openInEditor")}
            </Button>
          ) : null}
        </div>
      </header>

      {change.fields.length === 0 ? (
        <p className="project-review-empty project-review-empty--inline">
          <Icon icon={iconForEntity(change.entity)} size={16} />
          <span>{emptyChangeText(change, t)}</span>
        </p>
      ) : (
        <div className="project-review-fields">
          {change.fields.map((field) => (
            <FieldDiff key={field.label} field={field} />
          ))}
        </div>
      )}
    </section>
  );
}

function ChangeSummary({ diff, source }: { diff: AuthorDiff; source: string | null }) {
  const { t } = useTranslation();
  const counts = useMemo(() => {
    const tally: Record<AuthorChangeAction, number> = { added: 0, edited: 0, removed: 0 };
    for (const change of diff.changes) tally[change.action] += 1;
    return tally;
  }, [diff.changes]);

  const countKey: Record<AuthorChangeAction, string> = {
    edited: "review.countEdited",
    added: "review.countAdded",
    removed: "review.countRemoved",
  };
  const order: AuthorChangeAction[] = ["edited", "added", "removed"];
  return (
    <header className="project-review-summary">
      {source ? (
        <span className="project-review-source">
          <Icon icon={FileJson2} size={13} />
          {source}
        </span>
      ) : null}
      <div className="project-review-counts">
        {order
          .filter((action) => counts[action] > 0)
          .map((action) => (
            <span key={action} className={`pr-count pr-count--${action}`}>
              <span className={`pr-dot pr-dot--${action}`} aria-hidden />
              {t(countKey[action], { count: counts[action] })}
            </span>
          ))}
      </div>
      {diff.truncated ? (
        <span className="project-review-truncated">{t("review.truncated")}</span>
      ) : null}
    </header>
  );
}

export function ProjectChangeReview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<AuthorChangeReviewPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const diff = payload?.diff ?? null;
  const selected =
    diff?.changes.find((change) => change.id === selectedId) ?? diff?.changes[0] ?? null;

  useEffect(() => {
    const open = (event: Event) => {
      const next = (event as CustomEvent<AuthorChangeReviewPayload>).detail;
      setPayload(next);
      setSelectedId(next.diff.changes[0]?.id ?? null);
    };
    window.addEventListener(AUTHOR_CHANGE_REVIEW_EVENT, open);
    return () => window.removeEventListener(AUTHOR_CHANGE_REVIEW_EVENT, open);
  }, []);

  if (!diff) return null;

  // File reviews carry a sourcePath and show a generic heading + path chip;
  // contribution reviews put the descriptive sentence straight in the title.
  const heading = diff.sourcePath ? t("review.heading") : diff.title;
  const source = diff.sourcePath ? (diff.sourcePath.split(/[/\\]/).pop() ?? diff.sourcePath) : null;
  const isSingle = diff.changes.length <= 1;
  const handleOpen = (change: AuthorChange) => {
    openChangeLocation(navigate, change);
    setPayload(null);
  };

  return (
    <ModalShell
      title={heading}
      onClose={() => setPayload(null)}
      footer={
        <Button variant="primary" size="sm" onClick={() => setPayload(null)}>
          {t("common.ok")}
        </Button>
      }
    >
      <div className={`project-review${isSingle ? " is-single" : ""}`}>
        <ChangeSummary diff={diff} source={source} />
        <div className="project-review-body">
          {isSingle ? null : (
            <ChangeList
              diff={diff}
              selectedId={selected?.id ?? null}
              onSelect={(change) => setSelectedId(change.id)}
            />
          )}
          <ChangeDetail change={selected} onOpen={handleOpen} />
        </div>
      </div>
    </ModalShell>
  );
}
