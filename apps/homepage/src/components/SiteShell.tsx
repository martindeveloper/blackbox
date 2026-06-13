"use client";

import { usePathname } from "next/navigation";
import { Nav, type NavItem } from "./Nav";
import { useTheme } from "../hooks/useTheme";
import { LogoPulseController } from "./LogoPulseController";
import "../i18n/index";

const GAMES_INDEX_NAV: NavItem[] = [
  { href: "#releases", label: "Releases" },
  { href: "/#features", label: "Engine" },
  { href: "/#editor", label: "Editor" },
];

const SILENT_ARCHIVE_NAV: NavItem[] = [
  { href: "#archive", label: "Archive" },
  { href: "#briefing", label: "Briefing" },
  { href: "#evidence", label: "Evidence" },
];

const EDITOR_NAV: NavItem[] = [
  { href: "#story", label: "Authoring" },
  { href: "#workspace", label: "Workspace" },
  { href: "#preview", label: "Preview" },
  { href: "#tools", label: "Tools" },
];

function navItemsForPath(pathname: string): NavItem[] | undefined {
  if (pathname === "/games") return GAMES_INDEX_NAV;
  if (pathname.startsWith("/games/silent-archive")) return SILENT_ARCHIVE_NAV;
  if (pathname === "/editor") return EDITOR_NAV;
  return undefined;
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { mode, setMode } = useTheme();

  return (
    <>
      <LogoPulseController />
      <Nav mode={mode} setMode={setMode} items={navItemsForPath(pathname)} />
      {children}
    </>
  );
}
