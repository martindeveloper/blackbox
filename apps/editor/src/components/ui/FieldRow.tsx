import type { ReactNode } from "react";
import { cn } from "./cn.js";

export function FieldRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("ui-field-row", className)}>{children}</div>;
}
