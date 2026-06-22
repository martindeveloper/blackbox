import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cycleTheme, type ThemeMode } from "@/hooks/useTheme";
import { LogoMark } from "./LogoMark";

const SunIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="5" />
    <path
      d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
      strokeLinecap="round"
    />
  </svg>
);

const MoonIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path
      d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const AutoIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M6 13h12" />
    <path d="M8 21h8" />
    <path d="M12 17v4" />
  </svg>
);

const THEME_META: Record<
  ThemeMode,
  { icon: ReactElement; labelKey: "nav.theme_light" | "nav.theme_dark" | "nav.theme_auto" }
> = {
  light: { icon: <SunIcon />, labelKey: "nav.theme_light" },
  dark: { icon: <MoonIcon />, labelKey: "nav.theme_dark" },
  auto: { icon: <AutoIcon />, labelKey: "nav.theme_auto" },
};

type SiteNavItem = {
  id: string;
  href: string;
  label: string;
};

type Props = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
};

function NavAnchor({
  href,
  className,
  children,
  ...rest
}: {
  href: string;
  className?: string;
  children: ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  );
}

function isSiteNavActive(id: string, pathname: string): boolean {
  switch (id) {
    case "engine":
      return pathname === "/";
    case "editor":
      return pathname === "/editor";
    case "docs":
      return pathname === "/docs" || pathname.startsWith("/docs/");
    case "download":
      return pathname === "/download";
    case "games":
      return pathname === "/games" || pathname.startsWith("/games/");
    default:
      return false;
  }
}

export function Nav({ mode, setMode }: Props) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [isScrolled, setIsScrolled] = useState(false);
  const { icon, labelKey } = THEME_META[mode];
  const label = t(labelKey);
  const siteItems = t("nav.site", { returnObjects: true }) as SiteNavItem[];

  useEffect(() => {
    const updateScrolledState = () => setIsScrolled(window.scrollY > 24);

    updateScrolledState();
    window.addEventListener("scroll", updateScrolledState, { passive: true });
    return () => window.removeEventListener("scroll", updateScrolledState);
  }, []);

  return (
    <nav className={`nav${isScrolled ? " nav--scrolled" : ""}`} aria-label={t("nav.site_aria")}>
      <div className="container nav-inner">
        <Link href="/" className="nav-logo" aria-label={t("nav.home_aria")}>
          <LogoMark className="nav-logo-mark" />
          <span className="nav-logo-text">
            <span className="nav-logo-text-black">{t("brand.wordmark_black")}</span>
            <span className="nav-logo-text-box">{t("brand.wordmark_box")}</span>
          </span>
        </Link>
        <div className="nav-links">
          <div className="nav-site-links">
            {siteItems.map((item) => (
              <NavAnchor
                key={item.id}
                href={item.href}
                className={`nav-link${isSiteNavActive(item.id, pathname) ? " nav-link--active" : ""}`}
                aria-current={isSiteNavActive(item.id, pathname) ? "page" : undefined}
              >
                {item.label}
              </NavAnchor>
            ))}
          </div>
          <button
            type="button"
            className="theme-btn"
            onClick={() => setMode(cycleTheme(mode))}
            title={t("nav.theme_title", { label })}
            aria-label={t("nav.theme_aria", { label })}
          >
            {icon}
          </button>
        </div>
      </div>
    </nav>
  );
}
