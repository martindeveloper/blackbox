"use client";

import { ThemeProvider } from "next-themes";
import { SiteShell } from "@/components/SiteShell";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem storageKey="bb-theme">
      <SiteShell>{children}</SiteShell>
    </ThemeProvider>
  );
}
