import { listDocs } from "@/lib/docs";
import { docLinkDescription, docTopicSummary } from "@/lib/docLlm";
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

function documentationIntro(): string[] {
  const topics = listDocs()
    .filter((doc) => doc.slug !== "index")
    .map((doc) => `- **${doc.title}** — ${docTopicSummary(doc)}`);

  return [
    en.metadata.openGraph.description,
    "",
    "Blackbox projects are JSON story documents edited in the desktop app. The same files work with the headless CLI for CI builds and with a local MCP server for agent tooling — no shadow copies or separate APIs.",
    "",
    "Documentation topics:",
    "",
    ...topics,
    "",
    `For complete guide markdown in one file, see [llm-full.txt](${absoluteUrl("/llm-full.txt")}).`,
  ];
}

function documentationLinks(): LlmLink[] {
  const links: LlmLink[] = listDocs().map((doc) => ({
    title: doc.title,
    href: docPath(doc.slug),
    description: docLinkDescription(doc),
  }));

  links.push({
    title: "Complete documentation (llm-full.txt)",
    href: "/llm-full.txt",
    description:
      "All guide markdown concatenated for agents that need the full reference in one fetch.",
  });

  return links;
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
  return [
    `# ${en.metadata.siteName}`,
    "",
    `> ${en.metadata.description}`,
    "",
    ...documentationIntro(),
    ...formatSection("Documentation", documentationLinks()),
    ...formatSection("Product", productPages()),
    ...formatSection("Optional", optionalPages()),
    "",
  ].join("\n");
}
