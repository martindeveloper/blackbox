import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

export interface ActivityTabProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: ReactNode;
}

export function ActivityTab({
  active,
  className,
  children,
  type = "button",
  ...props
}: ActivityTabProps) {
  return (
    <button
      type={type}
      className={cn("activity-btn", active && "activity-btn-active", className)}
      {...props}
    >
      {children}
    </button>
  );
}
