import type { Metadata } from "next";
import { GamesIndexPage } from "../../src/GamesIndexPage";

export const metadata: Metadata = {
  title: "Games",
  description:
    "Explore choice-driven narrative games built with Blackbox, where every decision leaves a trace.",
  alternates: {
    canonical: "/games",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/games",
    siteName: "Blackbox",
    title: "Blackbox Games — Choice Leaves a Trace",
    description:
      "Explore choice-driven narrative games built with Blackbox, where every decision leaves a trace.",
    images: [
      {
        url: "/games/og-games.jpg",
        width: 1200,
        height: 630,
        alt: "Blackbox Games — Choice Leaves a Trace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blackbox Games — Choice Leaves a Trace",
    description:
      "Explore choice-driven narrative games built with Blackbox, where every decision leaves a trace.",
    images: ["/games/og-games.jpg"],
  },
};

export default function Page() {
  return <GamesIndexPage />;
}
