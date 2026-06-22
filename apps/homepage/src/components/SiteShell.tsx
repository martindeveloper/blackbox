"use client";

import { Nav } from "./Nav";
import { useTheme } from "@/hooks/useTheme";
import { LogoPulseController } from "./LogoPulseController";
import "../i18n/index";

export function SiteShell({ children }: { children: React.ReactNode }) {
  const { mode, setMode } = useTheme();

  return (
    <>
      <LogoPulseController />
      <Nav mode={mode} setMode={setMode} />
      {children}
    </>
  );
}
