import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CatalogCategory } from "@/lib/catalogUsage.js";
import { ObjectSelector } from "@/components/pickers/ObjectSelector.js";
import { FieldRow } from "@/components/ui/FieldRow.js";
import { FormField } from "@/components/ui/FormField.js";
import { Select } from "@/components/ui/Select.js";
import { TextureRefThumb } from "./TextureRefThumb.js";

interface Props {
  label: string;
  textureRef?: string;
  variant?: "icon" | "portrait";
  emptyLabel?: string;
  ids: string[];
  value?: string;
  onChange: (value: string | undefined) => void;
  category?: CatalogCategory;
}

export function CatalogRefField({
  label,
  textureRef,
  variant,
  emptyLabel,
  ids,
  value,
  onChange,
  category,
}: Props) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <FormField label={label}>
      {variant && emptyLabel ? (
        <TextureRefThumb textureRef={textureRef} variant={variant} emptyLabel={emptyLabel} />
      ) : null}
      <FieldRow>
        <Select
          options={[
            { value: "", label: t("common.none") },
            ...ids.map((id) => ({ value: id, label: id })),
          ]}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
        {category ? (
          <button
            className="editor-btn editor-btn-sm editor-btn-icon"
            title={t("objectSelector.browse")}
            onClick={() => setPickerOpen(true)}
          >
            <FolderOpen size={13} />
          </button>
        ) : null}
      </FieldRow>
      {pickerOpen && category ? (
        <ObjectSelector
          mode={{ kind: "catalog", categories: [category] }}
          value={value}
          title={label}
          onSelect={(v) => {
            onChange(v || undefined);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </FormField>
  );
}
