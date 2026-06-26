import { Children, isValidElement, type ReactElement } from "react";
import type { Components } from "react-markdown";
import {
  formatShellCommandsForPlatform,
  ShellCodeBlock,
  shellFilenameForPlatform,
  shellLangForPlatform,
} from "@/components/ShellCodeBlock";
import { highlightCode } from "@/lib/codeHighlight";
import type { ClientOS } from "@/lib/detectClientOS";

const SHELL_LANGS = new Set(["bash", "sh", "shell", "zsh", "powershell", "ps1"]);

function langFromClassName(className: string | undefined): string | null {
  return /language-([\w-]+)/.exec(className ?? "")?.[1]?.toLowerCase() ?? null;
}

function isCodeElement(
  child: unknown,
): child is ReactElement<{ className?: string; children?: unknown }> {
  return isValidElement(child) && child.type === "code";
}

export function createDocsMarkdownComponents(clientOS: ClientOS): Components {
  const shellPlatform = clientOS === "windows" ? "windows" : "macos";

  return {
    pre({ children }) {
      const child = Children.toArray(children)[0];

      if (!isCodeElement(child)) {
        return <pre>{children}</pre>;
      }

      const lang = langFromClassName(child.props.className);
      if (!lang || !SHELL_LANGS.has(lang)) {
        return <pre>{children}</pre>;
      }

      const platform = lang === "powershell" || lang === "ps1" ? "windows" : shellPlatform;
      const commands = formatShellCommandsForPlatform(
        String(child.props.children ?? "").replace(/\n$/, ""),
        platform,
      );

      return (
        <ShellCodeBlock
          platform={platform}
          filename={shellFilenameForPlatform(platform)}
          lang={shellLangForPlatform(platform)}
          commands={commands}
          className="docs-code-block"
        />
      );
    },
    code({ className, children, ...props }) {
      const text = String(children).replace(/\n$/, "");
      const lang = langFromClassName(className);

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
}
