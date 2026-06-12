import type { ReactNode } from "react";

export interface FormFieldProps {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}

export function FormField({ label, children, hint, className }: FormFieldProps) {
  return (
    <label className={["form-field", className].filter(Boolean).join(" ")}>
      <span className="form-field-label">{label}</span>
      <div className="form-field-control">
        {children}
        {hint ? <span className="form-field-hint">{hint}</span> : null}
      </div>
    </label>
  );
}
