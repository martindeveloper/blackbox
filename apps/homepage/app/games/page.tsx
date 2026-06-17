import type { Metadata } from "next";
import { GamesIndexPage } from "@/GamesIndexPage";
import { en } from "@/i18n/en";

export const metadata: Metadata = {
  title: en.metadata.games.title,
  description: en.metadata.games.description,
  alternates: {
    canonical: "/games",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/games",
    siteName: en.metadata.siteName,
    title: en.metadata.games.openGraph.title,
    description: en.metadata.games.openGraph.description,
    images: [
      {
        url: "/games/og-games.jpg",
        width: 1200,
        height: 630,
        alt: en.metadata.games.openGraph.imageAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: en.metadata.games.twitter.title,
    description: en.metadata.games.twitter.description,
    images: ["/games/og-games.jpg"],
  },
};

export default function Page() {
  return <GamesIndexPage />;
}
