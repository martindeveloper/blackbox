import type { Metadata } from "next";
import { SilentArchivePage } from "../../../src/SilentArchivePage";
import { en } from "../../../src/i18n/en";

export const metadata: Metadata = {
  title: en.metadata.silentArchive.title,
  description: en.metadata.silentArchive.description,
  alternates: {
    canonical: "/games/silent-archive",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/games/silent-archive",
    siteName: en.metadata.siteName,
    title: en.metadata.silentArchive.openGraph.title,
    description: en.metadata.silentArchive.openGraph.description,
    images: [
      {
        url: "/games/silent-archive/og-silent-archive.jpg",
        width: 1200,
        height: 630,
        alt: en.metadata.silentArchive.openGraph.imageAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: en.metadata.silentArchive.twitter.title,
    description: en.metadata.silentArchive.twitter.description,
    images: ["/games/silent-archive/og-silent-archive.jpg"],
  },
};

export default function Page() {
  return <SilentArchivePage />;
}
