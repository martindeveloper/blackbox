import { useTranslation } from "react-i18next";
import type { ExprInput } from "../../types/wire.js";
import { FormField } from "../ui/FormField.js";
import { Input } from "../ui/Input.js";
import { Select } from "../ui/Select.js";
import { InterpolationField } from "./InterpolationField.js";

function exprToDisplay(expr: ExprInput | undefined): string {
  if (expr === undefined) return "";
  if (typeof expr === "string") return expr;
  if (typeof expr === "number" || typeof expr === "boolean") return String(expr);
  return JSON.stringify(expr);
}

interface NumericOrExprFieldProps {
  label: string;
  literal?: number;
  expr?: ExprInput;
  onChange: (literal: number | undefined, expr: ExprInput | undefined) => void;
  hint?: string;
}

export function NumericOrExprField({
  label,
  literal,
  expr,
  onChange,
  hint,
}: NumericOrExprFieldProps) {
  const { t } = useTranslation();
  const mode = expr !== undefined ? "expr" : "literal";

  return (
    <div className="expr-field">
      <FormField label={label} hint={hint}>
        <Select
          className="expr-field-mode"
          options={[
            { value: "literal", label: t("expr.modeLiteral") },
            { value: "expr", label: t("expr.modeExpression") },
          ]}
          value={mode}
          onChange={(e) => {
            if (e.target.value === "expr") {
              onChange(undefined, "");
            } else {
              onChange(literal ?? 0, undefined);
            }
          }}
        />
      </FormField>
      {mode === "literal" ? (
        <FormField label={t("expr.literalValue")}>
          <Input
            type="number"
            value={literal ?? 0}
            onChange={(e) => onChange(Number(e.target.value), undefined)}
          />
        </FormField>
      ) : (
        <InterpolationField
          label={t("expr.expression")}
          value={exprToDisplay(expr)}
          context="effect"
          mono
          onChange={(next) => onChange(undefined, next || undefined)}
        />
      )}
    </div>
  );
}

interface ExprOnlyFieldProps {
  label: string;
  value?: ExprInput;
  onChange: (value: ExprInput | undefined) => void;
  hint?: string;
}

export function ExprOnlyField({ label, value, onChange, hint }: ExprOnlyFieldProps) {
  const { t } = useTranslation();
  const enabled = value !== undefined;

  return (
    <div className="expr-field">
      <FormField label={label} hint={hint}>
        <Select
          className="expr-field-mode"
          options={[
            { value: "off", label: t("common.none") },
            { value: "on", label: t("expr.modeExpression") },
          ]}
          value={enabled ? "on" : "off"}
          onChange={(e) => onChange(e.target.value === "on" ? "" : undefined)}
        />
      </FormField>
      {enabled ? (
        <InterpolationField
          label={t("expr.expression")}
          value={exprToDisplay(value)}
          context="effect"
          mono
          onChange={(next) => onChange(next || undefined)}
        />
      ) : null}
    </div>
  );
}
