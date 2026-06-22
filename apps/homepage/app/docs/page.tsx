import type { Metadata } from "next";
import { DocsPage } from "@/components/DocsPage";
import { DocsProse } from "@/components/DocsProse";
import { getDoc, listDocs } from "@/lib/docs";
import { en } from "@/i18n/en";

export const metadata: Metadata = {
  title: en.metadata.docs.title,
  description: en.metadata.docs.description,
  alternates: { canonical: "/docs" },
  openGraph: {
    title: en.metadata.docs.openGraph.title,
    description: en.metadata.docs.openGraph.description,
    url: "/docs",
  },
};

export default function Page() {
  const nav = listDocs();
  const doc = getDoc("index");
  return <DocsPage doc={doc} nav={nav} prose={<DocsProse content={doc.content} />} />;
}
