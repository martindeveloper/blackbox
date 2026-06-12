import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { catalogAssetIds } from "../../lib/catalogHealth.js";
import {
  buildCatalogUsageIndex,
  describeCatalogUsage,
  getCatalogUsages,
  type CatalogCategory,
} from "../../lib/catalogUsage.js";
import type { CatalogRefReplacement } from "../../lib/catalogDelete.js";
import type { LoadedBundle } from "../../lib/scenarioLoader.js";
import { ModalShell } from "../overlay/ModalShell.js";
import { Button } from "../ui/Button.js";
import { FormField } from "../ui/FormField.js";
import { Select } from "../ui/Select.js";

const UNSET_VALUE = "__unset__";

interface Props {
  bundle: LoadedBundle;
  category: CatalogCategory;
  assetKey: string;
  onClose: () => void;
  onConfirm: (replacement: CatalogRefReplacement | null) => void;
}

export function CatalogDeleteDialog({ bundle, category, assetKey, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  const usages = useMemo(() => {
    const index = buildCatalogUsageIndex(bundle);
    return getCatalogUsages(index, category, assetKey);
  }, [bundle, category, assetKey]);

  const replacementIds = useMemo(
    () => catalogAssetIds(bundle.assets, category).filter((id) => id !== assetKey),
    [bundle.assets, category, assetKey],
  );

  const [replacementValue, setReplacementValue] = useState(replacementIds[0] ?? UNSET_VALUE);

  const refCount = usages.length;
  const hasRefs = refCount > 0;
  const canDelete = !hasRefs || replacementValue.length > 0;

  const handleConfirm = () => {
    if (!canDelete) return;
    if (!hasRefs) {
      onConfirm(null);
      return;
    }
    const replacement: CatalogRefReplacement =
      replacementValue === UNSET_VALUE
        ? { mode: "unset" }
        : { mode: "replace", replacementKey: replacementValue };
    onConfirm(replacement);
  };

  return (
    <ModalShell
      title={t("catalog.confirmDelete.title")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" disabled={!canDelete} onClick={handleConfirm}>
            {t("common.delete")}
          </Button>
        </>
      }
    >
      <div className="catalog-delete-dialog">
        <p className="catalog-delete-dialog-lead">
          {t("catalog.confirmDelete.message", { assetKey, category })}
        </p>

        <div
          className={`catalog-delete-ref-count${hasRefs ? " catalog-delete-ref-count--warn" : ""}`}
        >
          <span className="catalog-delete-ref-count-value">{refCount}</span>
          <span className="catalog-delete-ref-count-label">
            {t("catalog.confirmDelete.referenceCount", { count: refCount })}
          </span>
        </div>

        {hasRefs ? (
          <>
            <ul className="catalog-delete-usage-list">
              {usages.map((usage, i) => {
                const { label } = describeCatalogUsage(t, usage);
                return (
                  <li key={`${usage.kind}-${i}`} className="catalog-delete-usage-item">
                    {label}
                  </li>
                );
              })}
            </ul>

            <FormField
              label={t("catalog.confirmDelete.replacementLabel")}
              hint={t("catalog.confirmDelete.replacementHint", { category })}
            >
              <Select
                value={replacementValue}
                onChange={(e) => setReplacementValue(e.target.value)}
                options={[
                  { value: UNSET_VALUE, label: t("catalog.confirmDelete.unsetOption") },
                  ...replacementIds.map((id) => ({ value: id, label: id })),
                ]}
              />
            </FormField>

            {replacementIds.length === 0 ? (
              <p className="catalog-delete-dialog-note">
                <AlertTriangle size={14} aria-hidden />
                {t("catalog.confirmDelete.noReplacements")}
              </p>
            ) : null}
          </>
        ) : (
          <p className="catalog-delete-dialog-note">{t("catalog.confirmDelete.noReferences")}</p>
        )}
      </div>
    </ModalShell>
  );
}
