import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.onbbx.com"),
  title: {
    default: "Blackbox",
    template: "%s | Blackbox",
  },
  description:
    "Build choice-driven narrative games with Blackbox, a text-based RPG engine for branching stories, persistent state, and cross-platform play.",
  applicationName: "Blackbox",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Blackbox",
    title: "Blackbox — Text-Based Narrative RPG Engine",
    description:
      "Build worlds. Write choices. Let Blackbox handle branching stories, persistent state, and cross-platform play.",
  },
  twitter: {
    card: "summary",
    title: "Blackbox — Text-Based Narrative RPG Engine",
    description:
      "Build worlds. Write choices. Let Blackbox handle branching stories, persistent state, and cross-platform play.",
  },
  icons: [
    { rel: "icon", type: "image/png", sizes: "32x32", url: "/icon-32.png" },
    { rel: "icon", type: "image/png", sizes: "16x16", url: "/icon-16.png" },
    { rel: "apple-touch-icon", sizes: "180x180", url: "/icon-180.png" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Share+Tech+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
