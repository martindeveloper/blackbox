import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@/components/icons/Icon.js";

export function entityInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export type CatalogEntityCardVariant = "portrait" | "icon";

export interface CatalogEntityCardProps {
  id: string;
  name: string;
  selected: boolean;
  onSelect: () => void;
  selectedLabel: string;
  imageUrl?: string | null;
  loading?: boolean;
  accent?: string;
  variant?: CatalogEntityCardVariant;
  badge?: string;
  fallbackIcon: LucideIcon;
  meta?: ReactNode;
}

export function CatalogEntityCard({
  id,
  name,
  selected,
  onSelect,
  selectedLabel,
  imageUrl,
  loading = false,
  accent = "var(--editor-primary)",
  variant = "portrait",
  badge,
  fallbackIcon,
  meta,
}: CatalogEntityCardProps) {
  const indexLabel = badge ?? id.slice(0, 2).toUpperCase();

  return (
    <button
      type="button"
      className={[
        "catalog-entity-card",
        selected ? "catalog-entity-card--selected" : "",
        variant === "icon" ? "catalog-entity-card--icon" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--entity-accent": accent } as CSSProperties}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="catalog-entity-art">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="catalog-entity-image" />
        ) : (
          <div className={`catalog-entity-fallback${loading ? " is-loading" : ""}`}>
            <span className="catalog-entity-initials">{entityInitials(name)}</span>
            <Icon icon={fallbackIcon} size={15} />
          </div>
        )}
        <div className="catalog-entity-shade" aria-hidden="true" />
        <span className="catalog-entity-index" aria-hidden="true">
          {indexLabel}
        </span>
        {selected ? <span className="catalog-entity-selected-mark">{selectedLabel}</span> : null}
      </div>

      <div className="catalog-entity-copy">
        <span className="catalog-entity-name">{name}</span>
        <span className="catalog-entity-id">{id}</span>
        {meta ? <div className="catalog-entity-meta">{meta}</div> : null}
      </div>
    </button>
  );
}

export interface CatalogEntityGridProps {
  kicker: string;
  title: string;
  countLabel: string;
  emptyLabel?: string;
  isEmpty?: boolean;
  children: ReactNode;
}

export function CatalogEntityGrid({
  kicker,
  title,
  countLabel,
  emptyLabel,
  isEmpty = false,
  children,
}: CatalogEntityGridProps) {
  return (
    <div className="catalog-entity-canvas">
      <header className="catalog-entity-canvas-header">
        <div>
          <span className="catalog-entity-canvas-kicker">{kicker}</span>
          <h1>{title}</h1>
        </div>
        <span className="catalog-entity-canvas-count">{countLabel}</span>
      </header>
      <div className="catalog-entity-grid">{children}</div>
      {isEmpty && emptyLabel ? (
        <div className="catalog-entity-filter-empty">{emptyLabel}</div>
      ) : null}
    </div>
  );
}
