import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { docsMarkdownComponents } from "@/lib/docsMarkdown";

type Props = {
  content: string;
};

export function DocsProse({ content }: Props) {
  return (
    <div className="docs-shell-prose">
      <Markdown remarkPlugins={[remarkGfm]} components={docsMarkdownComponents}>
        {content}
      </Markdown>
    </div>
  );
}
