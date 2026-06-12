import type { ReactNode } from "react";
import { cn } from "./cn.js";

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("editor-toolbar flex items-center gap-1.5 px-2 py-1", className)}>
      {children}
    </div>
  );
}
