import type { Metadata } from "next";
import { DownloadPage } from "@/DownloadPage";
import { en } from "@/i18n/en";
import { fetchEditorVersion } from "@/lib/fetchEditorVersion";

export const metadata: Metadata = {
  title: en.metadata.download.title,
  description: en.metadata.download.description,
  alternates: {
    canonical: "/download",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/download",
    siteName: en.metadata.siteName,
    title: en.metadata.download.openGraph.title,
    description: en.metadata.download.openGraph.description,
  },
  twitter: {
    card: "summary",
    title: en.metadata.download.twitter.title,
    description: en.metadata.download.twitter.description,
  },
};

export default async function Page() {
  const { version: releaseTag } = await fetchEditorVersion();
  return <DownloadPage releaseTag={releaseTag} />;
}
