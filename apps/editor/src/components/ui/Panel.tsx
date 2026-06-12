import type { ReactNode } from "react";
import { cn } from "./cn.js";

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex h-full flex-col overflow-hidden", className)}>{children}</div>;
}

export function PanelHeader({
  children,
  uppercase = false,
  className,
}: {
  children: ReactNode;
  uppercase?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("panel-header", uppercase && "panel-header-uppercase", className)}>
      {children}
    </div>
  );
}

export function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex-1 overflow-y-auto", className)}>{children}</div>;
}
