import { forwardRef } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";

export const TabletLandscapeIcon: LucideIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ color = "currentColor", size = 24, strokeWidth = 2, className, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      focusable={false}
      {...props}
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
);

TabletLandscapeIcon.displayName = "TabletLandscape";
