import type { ReactNode } from "react";
import { cn } from "./cn.js";

export type AlertVariant = "error" | "warning" | "info";

export function Alert({
  variant = "error",
  children,
  className,
}: {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "editor-alert-error",
        variant === "warning" && "editor-alert-warning",
        variant === "info" && "editor-alert-info",
        className,
      )}
    >
      {children}
    </div>
  );
}
