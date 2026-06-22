import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useScenarioStore } from "@/store/useScenarioStore.js";
import {
  entriesForCategory,
  getCatalogFileStatus,
  isCatalogEntryExternallyUsed,
  mediaPathSet,
} from "@/lib/catalogHealth.js";
import {
  buildCatalogUsageIndex,
  catalogUsageKey,
  type CatalogCategory,
} from "@/lib/catalogUsage.js";
import { MEDIA_CATEGORIES } from "@/lib/mediaLibrary.js";
import { navigateToCatalogEntry } from "@/lib/routeHelpers.js";
import { Input } from "@/components/ui/Input.js";
import { ListItem } from "@/components/ui/ListItem.js";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel.js";
import { Icon } from "@/components/icons/Icon.js";

interface CatalogSidebarProps {
  selectedCategory: CatalogCategory;
  selectedKey: string | null;
  onAdd: () => void;
}

function catalogEntryMatches(
  key: string,
  category: CatalogCategory,
  normalizedFilter: string,
  selectedCategory: CatalogCategory,
  selectedKey: string | null,
): boolean {
  if (!normalizedFilter) return true;
  if (selectedCategory === category && selectedKey === key) return true;
  return key.toLowerCase().includes(normalizedFilter);
}

export function CatalogSidebar({ selectedCategory, selectedKey, onAdd }: CatalogSidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const bundle = useScenarioStore((s) => s.bundle);
  const mediaFiles = useScenarioStore((s) => s.mediaFiles);
  const [filter, setFilter] = useState("");

  const mediaPaths = useMemo(() => mediaPathSet(mediaFiles), [mediaFiles]);
  const usageIndex = useMemo(() => (bundle ? buildCatalogUsageIndex(bundle) : null), [bundle]);
  const normalizedFilter = filter.trim().toLowerCase();

  const visibleTotal = useMemo(() => {
    if (!normalizedFilter || !bundle) return -1;
    let count = 0;
    for (const cat of MEDIA_CATEGORIES) {
      for (const key of Object.keys(entriesForCategory(bundle.assets, cat))) {
        if (catalogEntryMatches(key, cat, normalizedFilter, selectedCategory, selectedKey)) {
          count += 1;
        }
      }
    }
    return count;
  }, [bundle, normalizedFilter, selectedCategory, selectedKey]);

  if (!bundle) return null;

  return (
    <Panel>
      <PanelHeader uppercase className="catalog-sidebar-header">
        <span>{t("activity.assets")}</span>
        <button
          type="button"
          className="catalog-sidebar-add"
          onClick={onAdd}
          title={t("catalog.addEntry")}
        >
          <Icon icon={Plus} size={11} />
        </button>
      </PanelHeader>
      <div className="catalog-sidebar-filter">
        <Input
          compact
          mono
          type="search"
          value={filter}
          placeholder={t("catalog.filterPlaceholder")}
          aria-label={t("catalog.filterPlaceholder")}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <PanelBody className="catalog-sidebar-body">
        {MEDIA_CATEGORIES.map((cat) => {
          const entries = entriesForCategory(bundle.assets, cat);
          const keys = Object.keys(entries).sort();
          const visibleKeys = keys.filter((key) =>
            catalogEntryMatches(key, cat, normalizedFilter, selectedCategory, selectedKey),
          );
          const isActiveCategory = selectedCategory === cat && !selectedKey;

          if (normalizedFilter && visibleKeys.length === 0) {
            return null;
          }

          return (
            <section key={cat} className="catalog-sidebar-section">
              <button
                type="button"
                className={`catalog-sidebar-category${isActiveCategory ? " catalog-sidebar-category--active" : ""}`}
                onClick={() => void navigateToCatalogEntry(navigate, cat, null)}
              >
                <span>{t(`media.categories.${cat}`)}</span>
                <span className="catalog-sidebar-count">
                  {normalizedFilter ? `${visibleKeys.length}/${keys.length}` : keys.length}
                </span>
              </button>
              {visibleKeys.map((key) => {
                const entry = entries[key]!;
                const status = getCatalogFileStatus(entry.src, mediaPaths);
                const used =
                  (usageIndex?.has(catalogUsageKey(cat, key)) ?? false) ||
                  isCatalogEntryExternallyUsed(bundle.assets, cat, key);

                return (
                  <ListItem
                    key={key}
                    mono
                    selected={selectedCategory === cat && selectedKey === key}
                    className="catalog-sidebar-item"
                    onClick={() => void navigateToCatalogEntry(navigate, cat, key)}
                  >
                    <span className="catalog-sidebar-item-label">{key}</span>
                    <span className="catalog-sidebar-item-dots" aria-hidden>
                      {!used ? (
                        <span
                          className="catalog-dot catalog-dot--unused"
                          title={t("catalog.unused")}
                        />
                      ) : null}
                      {status === "missing" ? (
                        <span
                          className="catalog-dot catalog-dot--missing"
                          title={t("catalog.fileStatus.missing")}
                        />
                      ) : null}
                      {status === "empty" ? (
                        <span
                          className="catalog-dot catalog-dot--empty"
                          title={t("catalog.fileStatus.empty")}
                        />
                      ) : null}
                    </span>
                  </ListItem>
                );
              })}
            </section>
          );
        })}
        {visibleTotal === 0 ? (
          <p className="catalog-sidebar-filter-empty">{t("catalog.filterEmpty")}</p>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
