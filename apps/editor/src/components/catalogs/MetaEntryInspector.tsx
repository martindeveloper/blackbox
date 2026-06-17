import { ArrowUpRight, Pencil, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import {
  buildMetaUsageIndex,
  getMetaUsages,
  metaUsageNavigateTarget,
} from "../../lib/metaUsage.js";
import type { MetaEntryKind } from "../../lib/metaUsage.js";
import { editorNavigate, navigateToMetaEntry } from "../../lib/routeHelpers.js";
import { translate } from "../../lib/i18n.js";
import { confirmModal } from "../../lib/modalApi.js";
import { notifyError, notifySuccess } from "../../lib/notifyApi.js";
import { Button } from "../ui/Button.js";
import { Checkbox } from "../ui/Checkbox.js";
import { FieldRow } from "../ui/FieldRow.js";
import { FormField } from "../ui/FormField.js";
import { Input } from "../ui/Input.js";

interface Props {
  kind: MetaEntryKind;
  entryId: string;
}

export function MetaEntryInspector({ kind, entryId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const bundle = useScenarioStore((s) => s.bundle);
  const updateMetaEntry = useScenarioStore((s) => s.updateMetaEntry);
  const renameMetaEntry = useScenarioStore((s) => s.renameMetaEntry);
  const deleteMetaEntry = useScenarioStore((s) => s.deleteMetaEntry);

  const [renameOpen, setRenameOpen] = useState(entryId.startsWith("new_"));
  const [renameValue, setRenameValue] = useState(entryId);
  const [trackedEntryId, setTrackedEntryId] = useState(entryId);

  if (trackedEntryId !== entryId) {
    setTrackedEntryId(entryId);
    setRenameValue(entryId);
    setRenameOpen(entryId.startsWith("new_"));
  }

  const usageIndex = useMemo(() => (bundle ? buildMetaUsageIndex(bundle) : new Map()), [bundle]);

  if (!bundle?.meta) return null;

  const catalog = kind === "event" ? bundle.meta.events : bundle.meta.flags;
  const entry = catalog[entryId];
  if (!entry) return null;

  const usages = getMetaUsages(usageIndex, kind, entryId);

  const handleRename = () => {
    const result = renameMetaEntry(kind, entryId, renameValue);
    if (!result.ok) {
      const msg =
        result.reason === "collision"
          ? t("meta.rename.collision", { id: renameValue.trim() })
          : result.reason === "missing"
            ? t("meta.rename.missing", { id: entryId })
            : t("meta.rename.invalid");
      notifyError(msg);
      return;
    }
    if (renameValue.trim() !== entryId) {
      notifySuccess(t("meta.rename.success", { oldId: entryId, newId: renameValue.trim() }));
      void navigateToMetaEntry(navigate, kind, renameValue.trim());
    }
    setRenameOpen(false);
  };

  const handleDelete = async () => {
    const ok = await confirmModal({
      title: translate("meta.confirmDelete.title"),
      message: translate("meta.confirmDelete.message", { id: entryId }),
      variant: "danger",
      confirmLabel: translate("common.delete"),
    });
    if (!ok) return;
    deleteMetaEntry(kind, entryId);
    void navigateToMetaEntry(navigate, kind, null);
  };

  return (
    <div className="catalog-detail catalog-detail--inspector">
      <header className="catalog-detail-header">
        <span className="font-mono text-[10px] text-muted">
          {kind === "event" ? "event" : "flag"}
        </span>
        <div className="catalog-detail-header-actions">
          <Button
            variant="ghost"
            size="sm"
            icon
            leadingIcon={Pencil}
            className="catalog-detail-action"
            aria-label={t("common.rename")}
            title={t("common.rename")}
            onClick={() => {
              setRenameValue(entryId);
              setRenameOpen(true);
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            icon
            leadingIcon={Trash2}
            className="catalog-detail-action catalog-detail-action--danger"
            aria-label={t("common.delete")}
            title={t("common.delete")}
            onClick={() => void handleDelete()}
          />
        </div>
      </header>

      {renameOpen ? (
        <div className="catalog-rename">
          <FormField label={t("meta.rename.label")} hint={t("meta.rename.hint")}>
            <FieldRow>
              <Input
                autoFocus
                mono
                value={renameValue}
                aria-label={t("meta.rename.label")}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") setRenameOpen(false);
                }}
              />
              <Button size="sm" onClick={handleRename}>
                {t("common.rename")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon
                leadingIcon={X}
                title={t("common.cancel")}
                onClick={() => setRenameOpen(false)}
              />
            </FieldRow>
          </FormField>
        </div>
      ) : null}

      <div className="catalog-detail-fields">
        <FormField label={t("common.title")}>
          <Input
            value={entry.title ?? ""}
            onChange={(e) => updateMetaEntry(kind, entryId, { title: e.target.value })}
          />
        </FormField>

        <FormField label={t("common.description")}>
          <textarea
            className="input w-full resize-y rounded border border-border bg-surface px-2 py-1.5 font-sans text-xs text-primary placeholder:text-muted-2 focus:outline-none focus:ring-1 focus:ring-accent"
            rows={3}
            value={entry.description ?? ""}
            onChange={(e) => updateMetaEntry(kind, entryId, { description: e.target.value })}
          />
        </FormField>

        <Checkbox
          label={t("meta.internal")}
          checked={entry.internal ?? false}
          onChange={(e) => updateMetaEntry(kind, entryId, { internal: e.target.checked })}
        />
      </div>

      <MetaUsageSection usages={usages} t={t} navigate={navigate} />
    </div>
  );
}

function MetaUsageSection({
  usages,
  t,
  navigate,
}: {
  usages: ReturnType<typeof getMetaUsages>;
  t: (k: string, opts?: Record<string, string>) => string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  if (usages.length === 0) {
    return (
      <section className="meta-usage-section">
        <p className="meta-usage-empty">{t("meta.noUsages")}</p>
      </section>
    );
  }

  return (
    <section className="meta-usage-section">
      <header className="meta-usage-header">
        <span>{t("meta.usedIn")}</span>
        <span className="meta-usage-count">{usages.length}</span>
      </header>
      <ul className="meta-usage-list">
        {usages.map((usage, i) => {
          const target = metaUsageNavigateTarget(usage);
          const contextLabel = t(`meta.usageContext.${usage.context}`);
          const kindLabel = t(`meta.usageKind.${usage.effectKind}`);

          const primaryLabel = usage.nodeId ?? usage.itemId ?? kindLabel;
          const detailParts = [
            usage.chapterId,
            usage.choiceId ?? usage.actionId,
            kindLabel,
            contextLabel,
          ].filter(Boolean);
          const detailLabel = detailParts.join(" · ");
          const label = `${primaryLabel} · ${detailLabel}`;
          const key = [
            usage.chapterId,
            usage.nodeId,
            usage.choiceId,
            usage.itemId,
            usage.actionId,
            usage.effectKind,
            usage.context,
            i,
          ]
            .filter(Boolean)
            .join(":");

          if (target) {
            return (
              <li key={key}>
                <button
                  type="button"
                  className="meta-usage-link"
                  aria-label={label}
                  onClick={() =>
                    void editorNavigate(navigate, { to: target.to, search: target.search })
                  }
                >
                  <span className="meta-usage-copy">
                    <span className="meta-usage-target">{primaryLabel}</span>
                    <span className="meta-usage-detail">{detailLabel}</span>
                  </span>
                  <ArrowUpRight className="meta-usage-open-icon" size={14} aria-hidden="true" />
                </button>
              </li>
            );
          }
          return (
            <li key={key} className="meta-usage-static">
              <span className="meta-usage-target">{primaryLabel}</span>
              <span className="meta-usage-detail">{detailLabel}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
