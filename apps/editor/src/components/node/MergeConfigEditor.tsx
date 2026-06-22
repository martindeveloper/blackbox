import { useTranslation } from "react-i18next";
import type { MergeConfig } from "@/types/wire.js";
import { FormField } from "@/components/ui/FormField.js";
import { Section, SectionBody, SectionHeader } from "@/components/ui/Section.js";
import { Select } from "@/components/ui/Select.js";

interface MergeConfigEditorProps {
  merge: MergeConfig;
  onChange: (merge: MergeConfig | undefined) => void;
}

export function MergeConfigEditor({ merge, onChange }: MergeConfigEditorProps) {
  const { t } = useTranslation();

  const patchField = (field: keyof MergeConfig, mode: string) => {
    const next = { ...merge };
    if (mode === "replace") {
      delete next[field];
    } else {
      next[field] = mode as "append" | "prepend";
    }
    onChange(Object.keys(next).length > 0 ? next : undefined);
  };

  return (
    <Section>
      <SectionHeader>{t("node.merge")}</SectionHeader>
      <SectionBody className="space-y-2">
        <p className="text-[10px] text-muted">{t("node.mergeHint")}</p>
        {(["text", "onEnter", "choices"] as const).map((field) => (
          <FormField key={field} label={t(`node.mergeFields.${field}`)}>
            <Select
              options={[
                { value: "replace", label: t("node.mergeModes.replace") },
                { value: "append", label: t("node.mergeModes.append") },
                { value: "prepend", label: t("node.mergeModes.prepend") },
              ]}
              value={merge[field] ?? "replace"}
              onChange={(e) => patchField(field, e.target.value)}
            />
          </FormField>
        ))}
      </SectionBody>
    </Section>
  );
}
