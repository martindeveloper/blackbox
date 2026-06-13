import type { Metadata } from "next";
import { EditorPage } from "../../src/EditorPage";

export const metadata: Metadata = {
  title: "Editor",
  description:
    "Explore Blackbox Editor, a local-first visual workspace for authoring, previewing, validating, simulating, and bundling narrative game projects.",
  alternates: {
    canonical: "/editor",
  },
  openGraph: {
    title: "Blackbox Editor",
    description:
      "Shape branching stories visually, preview from source, and validate every path with the Blackbox Rust toolchain.",
    url: "/editor",
    images: [{ url: "/editor_graph.webp", width: 1200, height: 737 }],
  },
};

export default function Page() {
  return <EditorPage />;
}
