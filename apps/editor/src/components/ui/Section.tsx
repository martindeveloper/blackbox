import type { ReactNode } from "react";
import { cn } from "./cn.js";

export function Section({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("editor-section", className)}>{children}</div>;
}

export function SectionHeader({ children }: { children: ReactNode }) {
  return <div className="editor-section-header">{children}</div>;
}

export function SectionBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("editor-section-body", className)}>{children}</div>;
}
