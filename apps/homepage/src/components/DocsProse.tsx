"use client";

import { useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useClientOS } from "@/hooks/useClientOS";
import { createDocsMarkdownComponents } from "@/lib/docsMarkdown";

type Props = {
  content: string;
};

export function DocsProse({ content }: Props) {
  const clientOS = useClientOS();
  const components = useMemo(() => createDocsMarkdownComponents(clientOS), [clientOS]);

  return (
    <div className="docs-shell-prose">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </Markdown>
    </div>
  );
}
