import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import {
  buildCatalogUsageIndex,
  describeCatalogUsage,
  getCatalogUsages,
  type CatalogCategory,
} from "@/lib/catalogUsage.js";
import type { LoadedBundle } from "@/lib/scenarioLoader.js";
import { editorNavigate } from "@/lib/routeHelpers.js";

interface CatalogUsageListProps {
  bundle: LoadedBundle;
  category: CatalogCategory;
  assetKey: string;
}

export function CatalogUsageList({ bundle, category, assetKey }: CatalogUsageListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const usageIndex = useMemo(() => buildCatalogUsageIndex(bundle), [bundle]);
  const usages = getCatalogUsages(usageIndex, category, assetKey);

  if (usages.length === 0) {
    return <p className="media-catalog-refs-empty">{t("catalog.unused")}</p>;
  }

  return (
    <div className="media-catalog-refs">
      <p className="media-catalog-refs-label">{t("catalog.usedInScenario")}</p>
      <ul className="media-catalog-refs-list">
        {usages.map((usage, index) => {
          const { label, target } = describeCatalogUsage(t, usage);
          const key = `${usage.kind}-${usage.itemId ?? usage.characterId ?? usage.nodeId ?? index}-${usage.context ?? ""}`;

          return (
            <li key={key}>
              {target ? (
                <button
                  type="button"
                  className="media-catalog-ref-link"
                  onClick={() => void editorNavigate(navigate, target)}
                >
                  {label}
                </button>
              ) : (
                <span className="media-catalog-ref-static">{label}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
