import type { ReactNode } from "react";

export interface FormFieldProps {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
  layout?: "grid" | "stacked";
}

export function FormField({ label, children, hint, className, layout = "grid" }: FormFieldProps) {
  return (
    <label
      className={["form-field", layout === "stacked" && "form-field--stacked", className]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="form-field-label">{label}</span>
      <div className="form-field-control">
        {children}
        {hint ? <span className="form-field-hint">{hint}</span> : null}
      </div>
    </label>
  );
}
