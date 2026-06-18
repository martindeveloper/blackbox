import type { Metadata } from "next";
import { Suspense } from "react";
import { DownloadPage } from "@/DownloadPage";
import { en } from "@/i18n/en";
import { fetchEditorVersion } from "@/lib/fetchEditorVersion";
import { isNewerVersion, normalizeReleaseTag } from "@/lib/releaseVersion";

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

function DownloadPageFallback() {
  return <main className="download-page download-page--loading" aria-busy="true" />;
}

async function DownloadPageLoader({
  searchParams,
}: {
  searchParams: Promise<{ version?: string }>;
}) {
  const { version: rawVersion } = await searchParams;
  const { version: latestVersion } = await fetchEditorVersion();
  const requestedVersion = normalizeReleaseTag(rawVersion);
  const isOutdated =
    requestedVersion !== null && isNewerVersion(latestVersion, requestedVersion);

  return (
    <DownloadPage
      latestVersion={latestVersion}
      requestedVersion={requestedVersion}
      isOutdated={isOutdated}
    />
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ version?: string }>;
}) {
  return (
    <Suspense fallback={<DownloadPageFallback />}>
      <DownloadPageLoader searchParams={searchParams} />
    </Suspense>
  );
}
