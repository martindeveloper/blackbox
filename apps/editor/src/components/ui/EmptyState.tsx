import type { ReactNode } from "react";
import { cn } from "./cn.js";

export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("editor-subtitle text-[12px]", className)}>{children}</p>;
}
