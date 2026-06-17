import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { en } from "@/i18n/en";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.onbbx.com"),
  title: en.metadata.title,
  description: en.metadata.description,
  applicationName: en.metadata.siteName,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: en.metadata.siteName,
    title: en.metadata.openGraph.title,
    description: en.metadata.openGraph.description,
  },
  twitter: {
    card: "summary",
    title: en.metadata.twitter.title,
    description: en.metadata.twitter.description,
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
