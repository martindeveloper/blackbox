import { ImageOff, Package, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { getCatalogEntry } from "../../lib/catalogHealth.js";
import { useMediaPreview } from "../../hooks/useMediaPreview.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { Page } from "../../lib/pages.js";
import { editorNavigate, useEditorSearch } from "../../lib/routeHelpers.js";
import type { ItemDefinition } from "../../types/wire.js";
import { Icon } from "../icons/Icon.js";
import { CatalogEntityCard, CatalogEntityGrid } from "./CatalogEntityGrid.js";
import { EntityIdToolbar } from "./EntityIdToolbar.js";

function ItemIconCard({
  id,
  item,
  selected,
  onSelect,
}: {
  id: string;
  item: ItemDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const bundle = useScenarioStore((s) => s.bundle);
  const projectId = useScenarioStore((s) => s.projectId);
  const iconEntry =
    bundle && item.iconRef ? getCatalogEntry(bundle.assets, "textures", item.iconRef) : undefined;
  const { url: iconUrl, loading } = useMediaPreview(projectId, iconEntry?.src);
  const actionCount = item.actions?.length ?? 0;
  const meta =
    item.iconRef || actionCount > 0 ? (
      <>
        {item.iconRef ? (
          <span className="catalog-entity-meta-chip" title={item.iconRef}>
            {item.iconRef}
          </span>
        ) : null}
        {actionCount > 0 ? (
          <span className="catalog-entity-meta-chip catalog-entity-meta-chip--trailing catalog-entity-meta-chip--accent">
            <Icon icon={Zap} size={10} />
            {t("items.actionCount", { count: actionCount })}
          </span>
        ) : null}
      </>
    ) : undefined;

  return (
    <CatalogEntityCard
      id={id}
      name={item.name}
      selected={selected}
      onSelect={onSelect}
      selectedLabel={t("items.selected")}
      imageUrl={iconUrl}
      loading={loading}
      variant="icon"
      fallbackIcon={iconEntry ? Package : ImageOff}
      meta={meta}
    />
  );
}

export function ItemsEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useEditorSearch();
  const bundle = useScenarioStore((s) => s.bundle);
  const addItem = useScenarioStore((s) => s.addItem);

  if (!bundle) return null;

  const items = Object.entries(bundle.items.items).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="flex h-full flex-col bg-surface">
      <EntityIdToolbar
        placeholder={t("items.newIdPlaceholder")}
        addLabel={t("items.add")}
        onAdd={(id) => {
          addItem(id);
          void editorNavigate(navigate, { to: Page.EditorItems, search: { item: id } });
        }}
      />
      <CatalogEntityGrid
        kicker={t("items.inventory")}
        title={t("items.gridTitle")}
        countLabel={t("items.count", { count: items.length })}
        isEmpty={items.length === 0}
        emptyLabel={t("items.empty")}
      >
        {items.map(([id, item]) => (
          <ItemIconCard
            key={id}
            id={id}
            item={item}
            selected={search.item === id}
            onSelect={() =>
              void editorNavigate(navigate, { to: Page.EditorItems, search: { item: id } })
            }
          />
        ))}
      </CatalogEntityGrid>
    </div>
  );
}
