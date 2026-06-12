import type { ReactNode } from "react";
import { cn } from "./cn.js";

export function Title({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("editor-title", className)}>{children}</h2>;
}

export function InspectorTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <h3 className={cn("editor-title graph-node-id mb-2", className)}>{children}</h3>;
}

export function Subtitle({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("editor-subtitle", className)}>{children}</p>;
}
