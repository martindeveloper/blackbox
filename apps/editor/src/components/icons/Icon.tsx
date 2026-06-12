import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface IconProps {
  icon: LucideIcon;
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}

export function Icon({
  icon: IconComponent,
  size = 16,
  className,
  strokeWidth = 1.75,
  style,
}: IconProps) {
  return (
    <IconComponent
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      aria-hidden
      focusable={false}
    />
  );
}

interface IconLabelProps {
  icon: LucideIcon;
  children: ReactNode;
  iconSize?: number;
  className?: string;
}

export function IconLabel({ icon, children, iconSize = 14, className }: IconLabelProps) {
  return (
    <span className={`editor-btn-content ${className ?? ""}`}>
      <Icon icon={icon} size={iconSize} />
      {children}
    </span>
  );
}
