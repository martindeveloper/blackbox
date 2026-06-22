import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  CheckSquare,
  Flag,
  Image,
  Music,
  Package,
  Search,
  Square as SquareIcon,
  User,
  Volume2,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/icons/Icon.js";
import { Page } from "@/lib/pages.js";
import { editorNavigate } from "@/lib/projectRoute.js";
import { OMNIBOX_OPEN_EVENT, requestNodeFocus } from "@/lib/omnibox.js";
import { matchesShortcut } from "@/lib/shortcuts.js";
import { searchProject, type ScoutCategory, type ScoutHit } from "@/lib/toolsApi.js";
import { useUserPrefs } from "@/hooks/useUserPrefs.js";
import { useScenarioStore } from "@/store/useScenarioStore.js";

const ROUTE_TO_PAGE: Record<string, Page> = {
  "/graph": Page.EditorGraph,
  "/items": Page.EditorItems,
  "/characters": Page.EditorCharacters,
  "/assets": Page.EditorAssets,
  "/meta": Page.EditorMeta,
  "/library": Page.EditorLibrary,
};

const CATEGORY_ICON: Record<ScoutCategory, LucideIcon> = {
  node: Workflow,
  chapter: BookOpen,
  item: Package,
  character: User,
  flag: Flag,
  event: Zap,
  texture: Image,
  music: Music,
  sfx: Volume2,
};

export function Omnibox() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const projectId = useScenarioStore((s) => s.projectId);
  const { prefs } = useUserPrefs();
  const searchFullTextDefault = prefs.searchFullTextDefault ?? false;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fullTextOverride, setFullTextOverride] = useState<boolean | null>(null);
  const fullText = fullTextOverride ?? searchFullTextDefault;
  const [results, setResults] = useState<ScoutHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActive(0);
    setFullTextOverride(null);
  }, []);

  const openSearch = useCallback(() => {
    setFullTextOverride(null);
    setQuery("");
    setResults([]);
    setActive(0);
    setOpen(true);
  }, []);

  const toggleSearch = useCallback(() => {
    if (open) close();
    else openSearch();
  }, [open, close, openSearch]);

  useEffect(() => {
    const onEvent = () => openSearch();
    const onKey = (e: KeyboardEvent) => {
      if (matchesShortcut(e, "omniboxOpen")) {
        e.preventDefault();
        toggleSearch();
      }
    };
    window.addEventListener(OMNIBOX_OPEN_EVENT, onEvent);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OMNIBOX_OPEN_EVENT, onEvent);
      window.removeEventListener("keydown", onKey);
    };
  }, [openSearch, toggleSearch]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || !projectId) return;
    const controller = new AbortController();
    const handle = setTimeout(() => {
      void searchProject(projectId, query, { limit: 30, fullText, signal: controller.signal })
        .then((hits) => {
          setResults(hits);
          setActive(0);
        })
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [open, query, fullText, projectId]);

  const select = useCallback(
    (hit: ScoutHit) => {
      const to = ROUTE_TO_PAGE[hit.focus.route];
      if (!to) return;
      if (hit.category === "node" && hit.focus.params.chapter && hit.focus.params.node) {
        requestNodeFocus(hit.focus.params.chapter, hit.focus.params.node);
      }
      void editorNavigate(navigate, { to, search: hit.focus.params });
      close();
    },
    [navigate, close],
  );

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      select(results[active]);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center bg-black/30 pt-[12vh] backdrop-blur-sm"
      onMouseDown={close}
    >
      <div
        className="flex w-[min(640px,92vw)] flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-2xl"
        style={{
          background: "color-mix(in srgb, var(--editor-surface) 72%, transparent)",
          borderColor: "color-mix(in srgb, var(--editor-border-2) 70%, transparent)",
          boxShadow:
            "0 24px 60px -12px rgba(0,0,0,0.45), inset 0 1px 0 color-mix(in srgb, white 8%, transparent)",
        }}
        role="dialog"
        aria-label={t("omnibox.title")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-2 border-b px-3 py-2.5"
          style={{ borderColor: "var(--editor-border-subtle)" }}
        >
          <Icon icon={Search} size={16} style={{ color: "var(--editor-muted)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={t("omnibox.placeholder")}
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: "var(--editor-text)" }}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="button"
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
            style={{
              color: fullText ? "var(--editor-accent)" : "var(--editor-muted)",
              background: fullText
                ? "color-mix(in srgb, var(--editor-accent) 16%, transparent)"
                : "transparent",
            }}
            aria-pressed={fullText}
            title={t("omnibox.fullTextHint")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setFullTextOverride((override) => !(override ?? searchFullTextDefault))}
          >
            <Icon icon={fullText ? CheckSquare : SquareIcon} size={13} />
            {t("omnibox.fullText")}
          </button>
        </div>
        <ul className="max-h-[52vh] overflow-y-auto py-1">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm" style={{ color: "var(--editor-muted)" }}>
              {t("omnibox.empty")}
            </li>
          ) : (
            results.map((hit, i) => (
              <li key={`${hit.category}:${hit.scenario}:${hit.id}`}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors"
                  style={{
                    background:
                      i === active
                        ? "color-mix(in srgb, var(--editor-accent) 22%, transparent)"
                        : "transparent",
                  }}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => select(hit)}
                >
                  <Icon
                    icon={CATEGORY_ICON[hit.category]}
                    size={15}
                    style={{ color: "var(--editor-muted)" }}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-sm"
                      style={{ color: "var(--editor-text)" }}
                    >
                      {hit.label}
                    </span>
                    <span
                      className="block truncate text-xs"
                      style={{ color: "var(--editor-muted)" }}
                    >
                      {hit.snippet ?? hit.id}
                    </span>
                  </span>
                  <span
                    className="shrink-0 text-[11px] uppercase tracking-wide"
                    style={{ color: "var(--editor-muted)" }}
                  >
                    {t(`omnibox.category.${hit.category}`)}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
