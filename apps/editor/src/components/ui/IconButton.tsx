import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { Button, type ButtonVariant } from "./Button.js";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  variant?: ButtonVariant;
  title?: string;
}

export function IconButton({ icon, variant = "ghost", title, ...props }: IconButtonProps) {
  return <Button variant={variant} icon leadingIcon={icon} title={title} {...props} />;
}
