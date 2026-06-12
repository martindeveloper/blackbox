import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

type CardVariant = "default" | "elevated";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: CardVariant;
}

export function Card({ children, variant = "default", className, ...props }: CardProps) {
  return (
    <div
      className={cn("ui-card", variant === "elevated" && "ui-card-elevated", className)}
      {...props}
    >
      {children}
    </div>
  );
}
