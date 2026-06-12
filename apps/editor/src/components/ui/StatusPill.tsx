import type { ReactNode } from "react";
import { cn } from "./cn.js";

export type StatusPillVariant = "error" | "warning" | "unsaved" | "info";

export function StatusPill({
  variant,
  children,
  className,
}: {
  variant: StatusPillVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "status-pill",
        variant === "error" && "status-pill-error",
        variant === "warning" && "status-pill-warning",
        variant === "unsaved" && "status-pill-unsaved",
        variant === "info" && "status-pill-info",
        className,
      )}
    >
      {children}
    </span>
  );
}
