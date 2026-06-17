"use client";

import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Nav, type NavItem } from "./Nav";
import { useTheme } from "@/hooks/useTheme";
import { LogoPulseController } from "./LogoPulseController";
import "../i18n/index";

function navItemsForPath(
  pathname: string,
  t: (key: string, options?: { returnObjects?: boolean }) => unknown,
): NavItem[] | undefined {
  if (pathname === "/games") {
    return t("nav.pages.games", { returnObjects: true }) as NavItem[];
  }
  if (pathname.startsWith("/games/silent-archive")) {
    return t("nav.pages.silentArchive", { returnObjects: true }) as NavItem[];
  }
  if (pathname === "/editor") {
    return t("nav.pages.editorPage", { returnObjects: true }) as NavItem[];
  }
  if (pathname === "/download") {
    return t("nav.pages.download", { returnObjects: true }) as NavItem[];
  }
  return undefined;
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { mode, setMode } = useTheme();
  const { t } = useTranslation();

  return (
    <>
      <LogoPulseController />
      <Nav mode={mode} setMode={setMode} items={navItemsForPath(pathname, t)} />
      {children}
    </>
  );
}
