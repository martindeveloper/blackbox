import { FolderOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildEditorRefIndex, metricsForCharacter, sortedRefList } from "@/lib/editorRefs.js";
import { useScenarioStore } from "@/store/useScenarioStore.js";
import type { CatalogCategory } from "@/lib/catalogUsage.js";
import { ObjectSelector } from "./ObjectSelector.js";
import { FieldRow } from "@/components/ui/FieldRow.js";
import { FormField } from "@/components/ui/FormField.js";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";

export type RefKind =
  | "node"
  | "item"
  | "character"
  | "flag"
  | "event"
  | "stat"
  | "chapter"
  | "metric"
  | "sfx";

interface RefPickerFieldProps {
  kind: RefKind;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  characterId?: string;
  allowCustom?: boolean;
}

function catalogCategoryForKind(kind: RefKind): CatalogCategory | null {
  if (kind === "sfx") return "sfx";
  return null;
}

export function RefPickerField({
  kind,
  value,
  onChange,
  label,
  characterId,
  allowCustom = true,
}: RefPickerFieldProps) {
  const { t } = useTranslation();
  const bundle = useScenarioStore((s) => s.bundle);
  const [pickerOpen, setPickerOpen] = useState(false);

  const options = useMemo(() => {
    if (!bundle) return [];
    const index = buildEditorRefIndex(bundle);
    switch (kind) {
      case "node":
        return sortedRefList(index.nodes);
      case "item":
        return sortedRefList(index.items);
      case "character":
        return sortedRefList(index.characters);
      case "flag":
        return sortedRefList(index.flags);
      case "event":
        return sortedRefList(index.events);
      case "stat":
        return sortedRefList(index.stats);
      case "chapter":
        return sortedRefList(index.chapters);
      case "metric":
        return characterId
          ? metricsForCharacter(bundle, characterId)
          : sortedRefList(new Set([...index.metrics].map((entry) => entry.split(":")[1] ?? entry)));
      case "sfx":
        return Object.keys(bundle.assets.sfx ?? {}).sort();
      default:
        return [];
    }
  }, [bundle, kind, characterId]);

  const catalogCategory = catalogCategoryForKind(kind);
  const showBrowse = catalogCategory !== null;

  const selectOptions = [
    ...(allowCustom ? [{ value: "__custom__", label: t("refPicker.custom") }] : []),
    ...options.map((option) => ({ value: option, label: option })),
  ];

  const selectValue = options.includes(value) ? value : allowCustom ? "__custom__" : value;

  return (
    <FormField label={label ?? ""}>
      {options.length > 0 && allowCustom ? (
        <Select
          className="mb-1.5"
          options={selectOptions}
          value={selectValue}
          onChange={(e) => {
            const next = e.target.value;
            if (next === "__custom__") return;
            onChange(next);
          }}
        />
      ) : null}
      <FieldRow>
        <Input
          mono
          list={options.length > 0 ? `ref-${kind}-${label ?? "field"}` : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {showBrowse ? (
          <button
            type="button"
            className="editor-btn editor-btn-sm editor-btn-icon"
            title={t("objectSelector.browse")}
            onClick={() => setPickerOpen(true)}
          >
            <FolderOpen size={13} />
          </button>
        ) : null}
      </FieldRow>
      {options.length > 0 ? (
        <datalist id={`ref-${kind}-${label ?? "field"}`}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ) : null}
      {pickerOpen && bundle && catalogCategory ? (
        <ObjectSelector
          mode={{ kind: "catalog", categories: [catalogCategory] }}
          value={value}
          title={label}
          onSelect={(next) => {
            onChange(next);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </FormField>
  );
}
