import { listDocs } from "@/lib/docs";
import { en } from "@/i18n/en";
import { absoluteUrl } from "@/lib/site";
import { docPath } from "@/lib/siteRoutes";

type LlmLink = {
  title: string;
  href: string;
  description: string;
};

function formatLink({ title, href, description }: LlmLink): string {
  return `- [${title}](${absoluteUrl(href)}): ${description}`;
}

function formatSection(title: string, links: LlmLink[]): string[] {
  return ["", `## ${title}`, "", ...links.map(formatLink)];
}

function productPages(): LlmLink[] {
  return [
    {
      title: "Home",
      href: "/",
      description: en.metadata.openGraph.description,
    },
    {
      title: en.metadata.editorPage.title,
      href: "/editor",
      description: en.metadata.editorPage.description,
    },
    {
      title: en.metadata.download.title,
      href: "/download",
      description: en.metadata.download.description,
    },
    {
      title: en.metadata.games.title,
      href: "/games",
      description: en.metadata.games.description,
    },
  ];
}

function optionalPages(): LlmLink[] {
  return [
    {
      title: en.metadata.silentArchive.title,
      href: "/games/silent-archive",
      description: en.metadata.silentArchive.description,
    },
    {
      title: "GitHub repository",
      href: en.github_url,
      description: "Source code, issues, and release assets",
    },
  ];
}

export function renderLlmTxt(): string {
  const docLinks: LlmLink[] = listDocs().map((doc) => ({
    title: doc.title,
    href: docPath(doc.slug),
    description: doc.description,
  }));

  return [
    `# ${en.metadata.siteName}`,
    "",
    `> ${en.metadata.description}`,
    "",
    en.metadata.openGraph.description,
    ...formatSection("Documentation", docLinks),
    ...formatSection("Product", productPages()),
    ...formatSection("Optional", optionalPages()),
    "",
  ].join("\n");
}
