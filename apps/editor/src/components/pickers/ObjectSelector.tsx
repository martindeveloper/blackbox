import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  CheckCircle,
  FileJson,
  FolderOpen,
  ImageIcon,
  Minus,
  Music,
  Search,
  Volume2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { getCatalogFileStatus, entriesForCategory, mediaPathSet } from "../../lib/catalogHealth.js";
import { MEDIA_CATEGORIES, type MediaCategory } from "../../lib/mediaLibrary.js";
import type { CatalogCategory } from "../../lib/catalogUsage.js";
import { useProjectRootFiles } from "../../hooks/useProjectRootFiles.js";
import { useMediaPreview } from "../../hooks/useMediaPreview.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { IconButton } from "../ui/IconButton.js";

export interface ObjSelectorMediaMode {
  kind: "media";
  categories?: MediaCategory[];
}

export interface ObjSelectorCatalogMode {
  kind: "catalog";
  categories?: CatalogCategory[];
}

export interface ObjSelectorSidecarMode {
  kind: "sidecar";
  /**
   * When set, the sidebar pre-selects these spec values as an active filter.
   * If only one spec is provided and all files match, the sidebar is hidden.
   */
  specs?: string[];
}

export type ObjSelectorMode =
  | ObjSelectorMediaMode
  | ObjSelectorCatalogMode
  | ObjSelectorSidecarMode;

export interface ObjectSelectorProps {
  mode: ObjSelectorMode;
  value?: string;
  title?: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

interface MediaItem {
  kind: "media";
  path: string;
  name: string;
  folder: string;
  category: MediaCategory;
  size: number;
  mimeType: string;
}

interface CatalogItem {
  kind: "catalog";
  id: string;
  category: CatalogCategory;
  src: string;
  fileStatus: "found" | "missing" | "empty";
}

interface SidecarItem {
  kind: "sidecar";
  path: string;
  name: string;
  spec: string | null;
}

type SelectorItem = MediaItem | CatalogItem | SidecarItem;

type DisplayRow =
  | { type: "header"; label: string; key: string }
  | { type: "item"; item: SelectorItem; key: string; itemIndex: number };

function itemValue(item: SelectorItem): string {
  return item.kind === "catalog" ? item.id : item.path;
}

function itemLabel(item: SelectorItem): string {
  return item.kind === "catalog" ? item.id : item.name;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortSpec(spec: string): string {
  return spec.startsWith("com.blackbox.") ? spec.slice("com.blackbox.".length) : spec;
}

export function ObjectSelector({ mode, value, title, onSelect, onClose }: ObjectSelectorProps) {
  const { t } = useTranslation();

  const bundle = useScenarioStore((s) => s.bundle);
  const mediaFiles = useScenarioStore((s) => s.mediaFiles);
  const projectId = useScenarioStore((s) => s.projectId);

  const mediaPaths = useMemo(() => mediaPathSet(mediaFiles), [mediaFiles]);
  const rootFiles = useProjectRootFiles();

  const [query, setQuery] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState(value ?? "");

  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const allItems = useMemo<SelectorItem[]>(() => {
    switch (mode.kind) {
      case "media": {
        const cats = mode.categories ?? MEDIA_CATEGORIES;
        return mediaFiles
          .filter((f) => cats.includes(f.category))
          .map<MediaItem>((f) => ({
            kind: "media",
            path: f.path,
            name: f.name,
            folder: f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : f.category,
            category: f.category,
            size: f.size,
            mimeType: f.mimeType,
          }));
      }
      case "catalog": {
        if (!bundle) return [];
        const cats = mode.categories ?? (MEDIA_CATEGORIES as CatalogCategory[]);
        return cats.flatMap((cat) =>
          Object.entries(entriesForCategory(bundle.assets, cat)).map<CatalogItem>(
            ([id, entry]) => ({
              kind: "catalog",
              id,
              category: cat,
              src: entry.src,
              fileStatus: getCatalogFileStatus(entry.src, mediaPaths),
            }),
          ),
        );
      }
      case "sidecar": {
        const specFilter = mode.specs;
        return rootFiles
          .filter((f) => !specFilter || specFilter.includes(f.spec ?? ""))
          .map<SidecarItem>((f) => ({
            kind: "sidecar",
            path: f.path,
            name: f.name,
            spec: f.spec,
          }));
      }
    }
  }, [mode, mediaFiles, bundle, mediaPaths, rootFiles]);

  const availableCategories = useMemo<string[]>(() => {
    if (mode.kind === "media") return mode.categories ?? MEDIA_CATEGORIES;
    if (mode.kind === "catalog") return mode.categories ?? (MEDIA_CATEGORIES as CatalogCategory[]);
    const specs = [
      ...new Set(
        (allItems as SidecarItem[]).map((i) => i.spec).filter((s): s is string => s !== null),
      ),
    ];
    return specs.length > 1 ? specs : [];
  }, [mode, allItems]);

  const filteredItems = useMemo(() => {
    let items = allItems;
    if (filterCat !== "all") {
      items = items.filter((i) => {
        if (i.kind === "media" || i.kind === "catalog") return i.category === filterCat;
        if (i.kind === "sidecar") return i.spec === filterCat;
        return true;
      });
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      items = items.filter((i) => {
        const label = itemLabel(i).toLowerCase();
        const extra =
          i.kind === "media"
            ? i.path.toLowerCase()
            : i.kind === "catalog"
              ? i.src.toLowerCase()
              : i.path.toLowerCase();
        return label.includes(q) || extra.includes(q);
      });
    }
    return items;
  }, [allItems, filterCat, query]);

  const displayRows = useMemo<DisplayRow[]>(() => {
    const rows: DisplayRow[] = [];
    let itemIndex = 0;

    if (mode.kind === "media") {
      const groups = new Map<string, SelectorItem[]>();
      for (const item of filteredItems) {
        const folder = (item as MediaItem).folder;
        if (!groups.has(folder)) groups.set(folder, []);
        groups.get(folder)!.push(item);
      }
      for (const [folder, items] of groups) {
        rows.push({ type: "header", label: folder, key: `h-${folder}` });
        for (const item of items) {
          rows.push({ type: "item", item, key: itemValue(item), itemIndex: itemIndex++ });
        }
      }
    } else if (mode.kind === "catalog") {
      const groups = new Map<string, SelectorItem[]>();
      for (const item of filteredItems) {
        const cat = (item as CatalogItem).category;
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat)!.push(item);
      }
      for (const [cat, items] of groups) {
        rows.push({ type: "header", label: cat.toUpperCase(), key: `h-${cat}` });
        for (const item of items) {
          rows.push({ type: "item", item, key: itemValue(item), itemIndex: itemIndex++ });
        }
      }
    } else {
      for (const item of filteredItems) {
        rows.push({ type: "item", item, key: itemValue(item), itemIndex: itemIndex++ });
      }
    }

    return rows;
  }, [filteredItems, mode.kind]);

  const flatItems = useMemo(
    () =>
      displayRows
        .filter((r): r is Extract<DisplayRow, { type: "item" }> => r.type === "item")
        .map((r) => r.item),
    [displayRows],
  );

  useEffect(() => {
    if (flatItems.length === 0) return;
    setCursor((c) => Math.min(c, flatItems.length - 1));
  }, [flatItems.length]);

  useEffect(() => {
    setCursor(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filterCat]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-item-index="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const selectedItem =
    flatItems.find((i) => itemValue(i) === selected) ?? flatItems[cursor] ?? null;
  const selectedPath = selectedItem ? itemValue(selectedItem) : "";

  useEffect(() => {
    const item = flatItems[cursor];
    if (item) setSelected(itemValue(item));
  }, [cursor, flatItems]);

  const previewPath =
    selectedItem?.kind === "media"
      ? selectedItem.path
      : selectedItem?.kind === "catalog"
        ? selectedItem.src
        : null;

  const { url: previewUrl } = useMediaPreview(projectId, previewPath, Boolean(previewPath));
  const isImage = previewPath ? /\.(png|jpe?g|webp|gif|svg)$/i.test(previewPath) : false;
  const isAudio = previewPath ? /\.(mp3|wav|ogg|m4a)$/i.test(previewPath) : false;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedPath) onSelect(selectedPath);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const defaultTitle =
    mode.kind === "media"
      ? t("objectSelector.titleMedia")
      : mode.kind === "catalog"
        ? t("objectSelector.titleCatalog")
        : t("objectSelector.titleSidecar");

  return createPortal(
    <div
      className="obj-picker-backdrop"
      role="presentation"
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="obj-picker"
        role="dialog"
        aria-modal="true"
        aria-label={title ?? defaultTitle}
        tabIndex={-1}
      >
        <div className="obj-picker-header">
          <Search size={13} className="obj-picker-search-icon" aria-hidden />
          <input
            ref={searchRef}
            className="obj-picker-search"
            placeholder={t("objectSelector.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t("objectSelector.searchPlaceholder")}
          />
          {query ? (
            <button
              className="obj-picker-clear"
              onClick={() => setQuery("")}
              aria-label={t("objectSelector.clearSearch")}
            >
              <X size={12} />
            </button>
          ) : null}
          <span className="obj-picker-esc-hint">{t("objectSelector.escHint")}</span>
          <IconButton icon={X} title={t("modal.close")} onClick={onClose} />
        </div>

        <div className="obj-picker-body">
          {availableCategories.length > 1 ? (
            <aside className="obj-picker-sidebar">
              <div className="obj-picker-sidebar-label">{t("objectSelector.show")}</div>
              <FilterBtn
                active={filterCat === "all"}
                count={allItems.length}
                onClick={() => setFilterCat("all")}
              >
                {t("objectSelector.filterAll")}
              </FilterBtn>
              {availableCategories.map((cat) => {
                const count =
                  mode.kind === "sidecar"
                    ? (allItems as SidecarItem[]).filter((i) => i.spec === cat).length
                    : allItems.filter(
                        (i) => (i.kind === "media" || i.kind === "catalog") && i.category === cat,
                      ).length;
                const label = mode.kind === "sidecar" ? shortSpec(cat) : cat;
                const icon =
                  mode.kind !== "sidecar" ? (
                    <CategoryIcon category={cat as MediaCategory} />
                  ) : undefined;
                return (
                  <FilterBtn
                    key={cat}
                    active={filterCat === cat}
                    count={count}
                    onClick={() => setFilterCat(cat)}
                    icon={icon}
                  >
                    {label}
                  </FilterBtn>
                );
              })}
            </aside>
          ) : null}

          <div
            className="obj-picker-list"
            ref={listRef}
            role="listbox"
            aria-label={title ?? defaultTitle}
          >
            {displayRows.length === 0 ? (
              <div className="obj-picker-empty">
                {query ? t("objectSelector.noResults") : t("objectSelector.noFiles")}
              </div>
            ) : (
              displayRows.map((row) => {
                if (row.type === "header") {
                  return (
                    <div key={row.key} className="obj-picker-group-header">
                      {row.label}
                    </div>
                  );
                }

                const item = row.item;
                const isActive = row.itemIndex === cursor;

                return (
                  <div
                    key={row.key}
                    className={`obj-picker-item${isActive ? " obj-picker-item--active" : ""}`}
                    role="option"
                    aria-selected={isActive}
                    data-item-index={row.itemIndex}
                    onClick={() => setCursor(row.itemIndex)}
                    onDoubleClick={() => {
                      if (selectedPath) onSelect(selectedPath);
                    }}
                  >
                    {item.kind === "media" ? (
                      <>
                        <MediaTypeIcon mimeType={item.mimeType} />
                        <span className="obj-picker-item-name">{item.name}</span>
                        <span className="obj-picker-item-badge">{formatSize(item.size)}</span>
                      </>
                    ) : item.kind === "catalog" ? (
                      <>
                        <FileStatusDot status={item.fileStatus} />
                        <span className="obj-picker-item-name">{item.id}</span>
                        {item.src ? <span className="obj-picker-item-src">{item.src}</span> : null}
                      </>
                    ) : (
                      <>
                        <FileJson size={12} className="obj-picker-item-type-icon" />
                        <span className="obj-picker-item-name">{item.name}</span>
                        {(item as SidecarItem).spec ? (
                          <span className="obj-picker-item-badge obj-picker-item-spec-badge">
                            {shortSpec((item as SidecarItem).spec!)}
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <aside className="obj-picker-preview">
            {selectedItem ? (
              <>
                <div className="obj-picker-preview-media">
                  {isImage && previewUrl ? (
                    <img src={previewUrl} alt="" className="obj-picker-preview-img" />
                  ) : isAudio && previewUrl ? (
                    <audio
                      controls
                      src={previewUrl}
                      className="obj-picker-preview-audio"
                      aria-label={itemLabel(selectedItem)}
                    >
                      <track kind="captions" />
                    </audio>
                  ) : (
                    <div className="obj-picker-preview-placeholder">
                      <PlaceholderIcon item={selectedItem} />
                    </div>
                  )}
                </div>

                <div className="obj-picker-preview-meta">
                  <div className="obj-picker-preview-name">{itemLabel(selectedItem)}</div>

                  {selectedItem.kind === "media" ? (
                    <>
                      <StatRow label={t("objectSelector.statPath")}>{selectedItem.path}</StatRow>
                      <StatRow label={t("objectSelector.statSize")}>
                        {formatSize(selectedItem.size)}
                      </StatRow>
                      <StatRow label={t("objectSelector.statType")}>
                        {selectedItem.mimeType}
                      </StatRow>
                    </>
                  ) : selectedItem.kind === "catalog" ? (
                    <>
                      <StatRow label={t("objectSelector.statId")}>{selectedItem.id}</StatRow>
                      <StatRow label={t("objectSelector.statCat")}>{selectedItem.category}</StatRow>
                      <StatRow label={t("objectSelector.statSrc")}>
                        {selectedItem.src || t("common.emptyDash")}
                      </StatRow>
                      <div className="obj-picker-preview-stat">
                        <span className="obj-picker-preview-stat-label">
                          {t("objectSelector.statFile")}
                        </span>
                        <span
                          className={`obj-picker-file-badge obj-picker-file-badge--${selectedItem.fileStatus}`}
                        >
                          {selectedItem.fileStatus}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <StatRow label={t("objectSelector.statFile")}>{selectedItem.path}</StatRow>
                      {(selectedItem as SidecarItem).spec ? (
                        <StatRow label={t("objectSelector.statSpec")}>
                          {(selectedItem as SidecarItem).spec!}
                        </StatRow>
                      ) : null}
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="obj-picker-preview-empty">
                <FolderOpen size={24} />
                <span>{t("objectSelector.selectPrompt")}</span>
              </div>
            )}
          </aside>
        </div>

        <div className="obj-picker-footer">
          <div className="obj-picker-footer-value">
            {selectedPath ? (
              <span className="font-mono">{selectedPath}</span>
            ) : (
              <span className="obj-picker-footer-none">{t("objectSelector.noneSelected")}</span>
            )}
          </div>
          <button className="editor-btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            className="editor-btn editor-btn-primary"
            disabled={!selectedPath}
            onClick={() => {
              if (selectedPath) onSelect(selectedPath);
            }}
          >
            {t("objectSelector.select")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface FilterBtnProps {
  active: boolean;
  count: number;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

function FilterBtn({ active, count, onClick, icon, children }: FilterBtnProps) {
  return (
    <button
      className={`obj-picker-filter-btn${active ? " obj-picker-filter-btn--active" : ""}`}
      onClick={onClick}
    >
      {icon}
      <span className="obj-picker-filter-label">{children}</span>
      <span className="obj-picker-filter-count">{count}</span>
    </button>
  );
}

function CategoryIcon({ category }: { category: MediaCategory }) {
  const props = { size: 11, className: "obj-picker-filter-icon" } as const;
  if (category === "textures") return <ImageIcon {...props} />;
  if (category === "music") return <Music {...props} />;
  return <Volume2 {...props} />;
}

function MediaTypeIcon({ mimeType }: { mimeType: string }) {
  const cls = "obj-picker-item-type-icon";
  if (mimeType.startsWith("image/"))
    return <ImageIcon size={12} className={`${cls} ${cls}--image`} />;
  if (mimeType.startsWith("audio/")) return <Music size={12} className={`${cls} ${cls}--audio`} />;
  return <FileJson size={12} className={cls} />;
}

function FileStatusDot({ status }: { status: "found" | "missing" | "empty" }) {
  const cls = `obj-picker-item-status obj-picker-item-status--${status}`;
  if (status === "found") return <CheckCircle size={11} className={cls} />;
  if (status === "missing") return <AlertCircle size={11} className={cls} />;
  return <Minus size={11} className={cls} />;
}

function PlaceholderIcon({ item }: { item: SelectorItem }) {
  const props = { size: 28, className: "obj-picker-preview-placeholder-icon" } as const;
  if (item.kind === "media") {
    if (item.mimeType.startsWith("image/")) return <ImageIcon {...props} />;
    return <Music {...props} />;
  }
  return <FileJson {...props} />;
}

function StatRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="obj-picker-preview-stat">
      <span className="obj-picker-preview-stat-label">{label}</span>
      <span className="obj-picker-preview-stat-val">{children}</span>
    </div>
  );
}
