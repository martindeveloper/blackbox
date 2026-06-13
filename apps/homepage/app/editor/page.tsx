import type { Metadata } from "next";
import { EditorPage } from "../../src/EditorPage";
import { en } from "../../src/i18n/en";

export const metadata: Metadata = {
  title: en.metadata.editorPage.title,
  description: en.metadata.editorPage.description,
  alternates: {
    canonical: "/editor",
  },
  openGraph: {
    title: en.metadata.editorPage.openGraph.title,
    description: en.metadata.editorPage.openGraph.description,
    url: "/editor",
    images: [{ url: "/editor_graph.webp", width: 1200, height: 737 }],
  },
};

export default function Page() {
  return <EditorPage />;
}
