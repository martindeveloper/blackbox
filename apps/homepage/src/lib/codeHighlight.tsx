import type { ReactElement } from "react";
import { highlightJs } from "@/lib/jsHighlight";
import { highlightJson } from "@/lib/jsonHighlight";
import { highlightShell } from "@/lib/shellHighlight";
import { highlightYaml } from "@/lib/yamlHighlight";

const SHELL_LANGS = new Set(["bash", "sh", "shell", "zsh"]);
const JS_LANGS = new Set(["js", "javascript", "jsx", "ts", "typescript", "tsx"]);

function normalizeLang(lang: string): string {
  return lang.trim().toLowerCase();
}

export function highlightCode(code: string, lang: string): ReactElement[] {
  const normalized = normalizeLang(lang);

  if (SHELL_LANGS.has(normalized)) {
    return highlightShell(code, "bash");
  }

  if (normalized === "powershell" || normalized === "ps1") {
    return highlightShell(code, "powershell");
  }

  if (normalized === "json" || normalized === "jsonc") {
    return highlightJson(code);
  }

  if (normalized === "yaml" || normalized === "yml") {
    return highlightYaml(code);
  }

  if (JS_LANGS.has(normalized)) {
    return highlightJs(code);
  }

  return [<span key="plain">{code}</span>];
}
