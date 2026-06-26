import type { Metadata } from "next";
import { TheLesserBloodPage } from "@/TheLesserBloodPage";
import { en } from "@/i18n/en";

export const metadata: Metadata = {
  title: en.metadata.theLesserBlood.title,
  description: en.metadata.theLesserBlood.description,
  alternates: {
    canonical: "/games/the-lesser-blood",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/games/the-lesser-blood",
    siteName: en.metadata.siteName,
    title: en.metadata.theLesserBlood.openGraph.title,
    description: en.metadata.theLesserBlood.openGraph.description,
    images: [
      {
        url: "/games/the-lesser-blood/mood.webp",
        width: 1672,
        height: 941,
        alt: en.metadata.theLesserBlood.openGraph.imageAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: en.metadata.theLesserBlood.twitter.title,
    description: en.metadata.theLesserBlood.twitter.description,
    images: ["/games/the-lesser-blood/mood.webp"],
  },
};

export default function Page() {
  return <TheLesserBloodPage />;
}
