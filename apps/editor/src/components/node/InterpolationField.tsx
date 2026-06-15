import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { InterpolationContext } from "../../lib/interpolationTokens.js";
import { tokensForContext } from "../../lib/interpolationTokens.js";
import { FormField } from "../ui/FormField.js";
import { Textarea } from "../ui/Textarea.js";

interface InterpolationFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  context?: InterpolationContext;
  mono?: boolean;
  rows?: number;
  hint?: string;
  placeholder?: string;
  layout?: "grid" | "stacked";
  showHint?: boolean;
}

export function InterpolationField({
  label,
  value,
  onChange,
  context = "text",
  mono = false,
  rows = 3,
  hint,
  placeholder,
  layout = "grid",
  showHint = true,
}: InterpolationFieldProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const tokens = tokensForContext(context);

  const insertToken = (insert: string) => {
    const el = inputRef.current;
    if (!el) {
      onChange(`${value}${insert}`);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${insert}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + insert.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <div className="interpolation-field">
      <FormField
        layout={layout}
        label={label ?? ""}
        hint={showHint ? (hint ?? t("interpolation.hint")) : undefined}
      >
        <Textarea
          ref={inputRef}
          className={mono ? "font-mono text-[11px]" : undefined}
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </FormField>
      <div
        className="interpolation-tokens"
        role="toolbar"
        aria-label={t("interpolation.tokensLabel")}
      >
        {tokens.map((token) => (
          <button
            key={token.id}
            type="button"
            className="interpolation-token"
            title={t(token.labelKey)}
            onClick={() => insertToken(token.insert)}
          >
            {t(token.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
