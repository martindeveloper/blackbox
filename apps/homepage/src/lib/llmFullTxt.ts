import { listDocs } from "@/lib/docs";
import { en } from "@/i18n/en";
import { absoluteUrl } from "@/lib/site";
import { docPath } from "@/lib/siteRoutes";

export function renderLlmFullTxt(): string {
  const docs = listDocs();
  const lines = [
    `# ${en.metadata.siteName}`,
    "",
    `> ${en.metadata.description}`,
    "",
    `HTML docs: ${absoluteUrl("/docs")}`,
    "",
  ];

  for (const doc of docs) {
    lines.push(
      "---",
      "",
      `# ${doc.title}`,
      "",
      `Source page: ${absoluteUrl(docPath(doc.slug))}`,
      "",
      doc.content.trim(),
      "",
    );
  }

  return lines.join("\n");
}
