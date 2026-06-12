import { Image, Music, Volume2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { Icon } from "../icons/Icon.js";
import {
  analyzeCatalogHealth,
  mediaPathSet,
  type CatalogCategoryStats,
} from "../../lib/catalogHealth.js";
import type { CatalogCategory } from "../../lib/catalogUsage.js";
import { Select } from "../ui/Select.js";
import { navigateToCatalogEntry } from "../../lib/routeHelpers.js";

const CATEGORY_ICONS: Record<CatalogCategory, LucideIcon> = {
  textures: Image,
  music: Music,
  sfx: Volume2,
};

export function CatalogOverview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const bundle = useScenarioStore((s) => s.bundle);
  const mediaFiles = useScenarioStore((s) => s.mediaFiles);
  const updateAssets = useScenarioStore((s) => s.updateAssets);

  const mediaPaths = useMemo(() => mediaPathSet(mediaFiles), [mediaFiles]);
  const analysis = useMemo(
    () => (bundle ? analyzeCatalogHealth(bundle, mediaPaths) : null),
    [bundle, mediaPaths],
  );

  if (!bundle || !analysis) return null;
  const { stats, attention } = analysis;

  return (
    <div className="catalog-canvas">
      <div className="catalog-canvas-body">
        <div className="catalog-overview">
          <header className="catalog-overview-header">
            <h1 className="catalog-overview-title">{t("catalog.overviewTitle")}</h1>
            <p className="catalog-overview-subtitle">{t("catalog.overviewSubtitle")}</p>
            <code className="catalog-overview-path">{bundle.filePaths.assets}</code>
          </header>

          <div className="catalog-stat-grid">
            {stats.map((row) => (
              <CategoryStatCard
                key={row.category}
                row={row}
                onBrowse={() => void navigateToCatalogEntry(navigate, row.category, null)}
              />
            ))}
          </div>

          <div className="catalog-default-sfx">
            <span className="catalog-default-sfx-label">{t("catalog.defaultChoiceSfx")}</span>
            <Select
              className="catalog-default-sfx-select"
              options={[
                { value: "", label: t("common.none") },
                ...Object.keys(bundle.assets.sfx ?? {})
                  .sort()
                  .map((id) => ({ value: id, label: id })),
              ]}
              value={bundle.assets.defaultChoiceSfx ?? ""}
              onChange={(e) =>
                updateAssets({
                  defaultChoiceSfx: e.target.value || undefined,
                })
              }
            />
            {bundle.assets.defaultChoiceSfx ? (
              <button
                type="button"
                className="catalog-default-sfx-value"
                onClick={() =>
                  void navigateToCatalogEntry(navigate, "sfx", bundle.assets.defaultChoiceSfx!)
                }
              >
                {bundle.assets.defaultChoiceSfx}
              </button>
            ) : null}
          </div>

          <section className="catalog-attention">
            <h2 className="catalog-attention-title">{t("catalog.attentionTitle")}</h2>
            {attention.length === 0 ? (
              <p className="catalog-attention-empty">{t("catalog.attentionClear")}</p>
            ) : (
              <ul className="catalog-attention-list">
                {attention.map((entry) => (
                  <li key={`${entry.category}.${entry.key}`}>
                    <button
                      type="button"
                      className="catalog-attention-item"
                      onClick={() =>
                        void navigateToCatalogEntry(navigate, entry.category, entry.key)
                      }
                    >
                      <span className="catalog-attention-key">{entry.key}</span>
                      <span
                        className={`catalog-attention-badge catalog-attention-badge--${entry.issue}`}
                      >
                        {t(`catalog.issue.${entry.issue}`)}
                      </span>
                      <span className="catalog-attention-category">
                        {t(`media.categories.${entry.category}`)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function CategoryStatCard({ row, onBrowse }: { row: CatalogCategoryStats; onBrowse: () => void }) {
  const { t } = useTranslation();
  const icon = CATEGORY_ICONS[row.category];

  return (
    <button type="button" className="catalog-stat-card" onClick={onBrowse}>
      <div className="catalog-stat-card-head">
        <Icon icon={icon} size={14} />
        <span>{t(`media.categories.${row.category}`)}</span>
      </div>
      <div className="catalog-stat-card-total">{row.total}</div>
      <div className="catalog-stat-card-meta">
        <span>{t("catalog.statUsed", { count: row.used })}</span>
        <span>{t("catalog.statUnused", { count: row.unused })}</span>
        {row.missingFile > 0 ? (
          <span className="catalog-stat-warn">
            {t("catalog.statMissing", { count: row.missingFile })}
          </span>
        ) : null}
      </div>
    </button>
  );
}
