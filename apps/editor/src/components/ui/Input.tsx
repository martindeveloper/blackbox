import type { InputHTMLAttributes } from "react";
import { cn } from "./cn.js";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  compact?: boolean;
}

export function Input({ mono, compact, className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "editor-input",
        mono && "font-mono",
        compact && "editor-input-compact",
        className,
      )}
      {...props}
    />
  );
}
