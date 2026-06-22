import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Icon, IconLabel } from "@/components/icons/Icon.js";
import { cn } from "./cn.js";

export type ButtonVariant = "default" | "primary" | "danger" | "ghost";
export type ButtonSize = "default" | "sm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: boolean;
  leadingIcon?: LucideIcon;
  children?: ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  default: "",
  primary: "editor-btn-primary",
  danger: "editor-btn-danger",
  ghost: "editor-btn-ghost",
};

export function Button({
  variant = "default",
  size = "default",
  icon = false,
  leadingIcon,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const content =
    leadingIcon && children ? (
      <IconLabel icon={leadingIcon}>{children}</IconLabel>
    ) : leadingIcon ? (
      <Icon icon={leadingIcon} size={size === "sm" ? 14 : 16} />
    ) : (
      children
    );

  return (
    <button
      type={type}
      className={cn(
        "editor-btn",
        variantClass[variant],
        size === "sm" && "editor-btn-sm",
        icon && "editor-btn-icon",
        className,
      )}
      {...props}
    >
      {content}
    </button>
  );
}
