import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
}

export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label className={cn("ui-checkbox", className)}>
      <input className="ui-checkbox-input" type="checkbox" {...props} />
      <span className="ui-checkbox-control" aria-hidden="true" />
      {label ? <span className="ui-checkbox-label">{label}</span> : null}
    </label>
  );
}
