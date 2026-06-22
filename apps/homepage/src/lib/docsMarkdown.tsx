import type { Components } from "react-markdown";
import { highlightCode } from "@/lib/codeHighlight";

export const docsMarkdownComponents: Components = {
  code({ className, children, ...props }) {
    const text = String(children).replace(/\n$/, "");
    const lang = /language-([\w-]+)/.exec(className ?? "")?.[1];

    if (lang) {
      return <code className={className}>{highlightCode(text, lang)}</code>;
    }

    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};
