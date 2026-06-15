import { forwardRef, type ReactNode } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import type { BuildPlatform } from "../../lib/buildApi.js";

function createPlatformIcon(displayName: string, children: ReactNode): LucideIcon {
  const Icon = forwardRef<SVGSVGElement, LucideProps>(
    ({ color = "currentColor", size = 24, strokeWidth = 1.75, className, ...props }, ref) => (
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
        {children}
      </svg>
    ),
  );
  Icon.displayName = displayName;
  return Icon;
}

export const WebPlatformIcon = createPlatformIcon(
  "WebPlatform",
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </>,
);

export const IosPlatformIcon = createPlatformIcon(
  "IosPlatform",
  <>
    <rect x="5" y="2" width="14" height="20" rx="3" />
    <path d="M9 7h6" />
    <path d="M12 17h.01" />
  </>,
);

export const AndroidPlatformIcon = createPlatformIcon(
  "AndroidPlatform",
  <>
    <path d="M8 3 7 5M16 3l1 2" />
    <rect x="7" y="5" width="10" height="14" rx="5" />
    <path d="M10 10h.01M14 10h.01" />
    <path d="M10 14h4" />
    <path d="M5 11v3M19 11v3" />
    <path d="M5 14l-1 2M19 14l1 2" />
  </>,
);

export const PLATFORM_ICONS: Record<BuildPlatform, LucideIcon> = {
  web: WebPlatformIcon,
  ios: IosPlatformIcon,
  android: AndroidPlatformIcon,
};
