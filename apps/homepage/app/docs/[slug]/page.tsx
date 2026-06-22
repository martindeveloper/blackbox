import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsPage } from "@/components/DocsPage";
import { DocsProse } from "@/components/DocsProse";
import { getDoc, listDocs } from "@/lib/docs";
import { en } from "@/i18n/en";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return listDocs()
    .filter((doc) => doc.slug !== "index")
    .map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const doc = getDoc(slug);
    return {
      title: doc.title,
      description: doc.description,
      alternates: { canonical: `/docs/${slug}` },
      openGraph: {
        title: en.metadata.docs.openGraph.pageTitle.replace("{{title}}", doc.title),
        description: doc.description,
        url: `/docs/${slug}`,
      },
    };
  } catch {
    return {};
  }
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  if (slug === "index") notFound();

  try {
    const nav = listDocs();
    const doc = getDoc(slug);
    return <DocsPage doc={doc} nav={nav} prose={<DocsProse content={doc.content} />} />;
  } catch {
    notFound();
  }
}
