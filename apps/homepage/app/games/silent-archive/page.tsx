import type { Metadata } from "next";
import { SilentArchivePage } from "../../../src/SilentArchivePage";

export const metadata: Metadata = {
  title: "Silent Archive",
  description:
    "Enter Archive Complex 7-Meridian in Silent Archive, a dark sci-fi noir narrative RPG built with Blackbox.",
  alternates: {
    canonical: "/games/silent-archive",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/games/silent-archive",
    siteName: "Blackbox",
    title: "Silent Archive — A Blackbox Narrative RPG",
    description:
      "Investigate Archive Complex 7-Meridian in a choice-driven dark sci-fi noir narrative.",
    images: [
      {
        url: "/games/silent-archive/og-silent-archive.jpg",
        width: 1200,
        height: 630,
        alt: "Silent Archive — Archive Complex 7-Meridian",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Silent Archive — A Blackbox Narrative RPG",
    description:
      "Investigate Archive Complex 7-Meridian in a choice-driven dark sci-fi noir narrative.",
    images: ["/games/silent-archive/og-silent-archive.jpg"],
  },
};

export default function Page() {
  return <SilentArchivePage />;
}
