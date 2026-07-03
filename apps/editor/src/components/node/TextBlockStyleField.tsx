import { useTranslation } from "react-i18next";
import {
  formatTextBlockStyleInput,
  parseTextBlockStyleInput,
  QUICK_TEXT_STYLES,
  styleHasToken,
  toggleTextBlockStyle,
  type QuickTextStyle,
} from "@/lib/textBlockStyle.js";
import { FormField } from "@/components/ui/FormField.js";
import { Input } from "@/components/ui/Input.js";

interface TextBlockStyleFieldProps {
  value: string[] | undefined;
  onChange: (style: string[] | undefined) => void;
}

export function TextBlockStyleField({ value, onChange }: TextBlockStyleFieldProps) {
  const { t } = useTranslation();

  const setFromInput = (raw: string) => {
    const style = parseTextBlockStyleInput(raw);
    onChange(style.length > 0 ? style : undefined);
  };

  const toggle = (token: QuickTextStyle) => {
    onChange(toggleTextBlockStyle(value, token));
  };

  return (
    <FormField label={t("textBlock.style")} hint={t("textBlock.styleHint")}>
      <div className="text-block-style-field">
        <Input
          placeholder={t("textBlock.stylePlaceholder")}
          value={formatTextBlockStyleInput(value)}
          onChange={(e) => setFromInput(e.target.value)}
        />
        <div
          className="text-block-style-quick"
          role="toolbar"
          aria-label={t("textBlock.styleQuick.label")}
        >
          {QUICK_TEXT_STYLES.map((token) => {
            const active = styleHasToken(value, token);
            return (
              <button
                key={token}
                type="button"
                className={`text-block-style-quick__token${active ? " text-block-style-quick__token--on" : ""}`}
                aria-pressed={active}
                title={t(`textBlock.styleQuick.${token}`)}
                onClick={() => toggle(token)}
              >
                {t(`textBlock.styleQuick.${token}`)}
              </button>
            );
          })}
        </div>
      </div>
    </FormField>
  );
}
