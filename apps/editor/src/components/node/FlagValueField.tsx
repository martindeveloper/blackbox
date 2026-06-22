import { useTranslation } from "react-i18next";
import type { JsonValue } from "@/types/wire.js";
import {
  flagValueFromPreset,
  flagValuePreset,
  flagValueToCustomString,
  parseCustomFlagValue,
  type FlagValuePreset,
} from "@/lib/flagValue.js";
import { FormField } from "@/components/ui/FormField.js";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";

interface FlagValueFieldProps {
  label?: string;
  value: JsonValue | undefined;
  onChange: (value: JsonValue | undefined) => void;
}

export function FlagValueField({ label, value, onChange }: FlagValueFieldProps) {
  const { t } = useTranslation();
  const preset = flagValuePreset(value);

  const handlePreset = (next: FlagValuePreset) => {
    if (next === "custom") {
      onChange(flagValueToCustomString(value) || "");
      return;
    }
    onChange(flagValueFromPreset(next));
  };

  return (
    <>
      <FormField label={label ?? t("gate.flagValue")}>
        <Select
          options={[
            { value: "unset", label: t("gate.flagValueUnset") },
            { value: "true", label: t("gate.flagValueTrue") },
            { value: "false", label: t("gate.flagValueFalse") },
            { value: "custom", label: t("gate.flagValueCustom") },
          ]}
          value={preset}
          onChange={(e) => handlePreset(e.target.value as FlagValuePreset)}
        />
      </FormField>
      {preset === "custom" ? (
        <FormField label={t("gate.flagValueCustomInput")} hint={t("gate.flagValueCustomHint")}>
          <Input
            mono
            value={flagValueToCustomString(value)}
            onChange={(e) => onChange(parseCustomFlagValue(e.target.value))}
          />
        </FormField>
      ) : null}
    </>
  );
}
