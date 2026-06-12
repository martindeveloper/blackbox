import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

export interface ListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  mono?: boolean;
  children: ReactNode;
}

export function ListItem({
  selected = false,
  mono = false,
  className,
  children,
  type = "button",
  ...props
}: ListItemProps) {
  return (
    <button
      type={type}
      className={cn(
        "list-item",
        mono && "font-mono text-[10px]",
        !mono && "text-[11px]",
        selected ? "list-item-selected" : "text-muted-2",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
