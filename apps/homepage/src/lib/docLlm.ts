import type { Doc } from "@/lib/docs";

function extractSection(content: string, heading: string): string {
  const pattern = new RegExp(`^## ${escapeRegExp(heading)}\\r?\\n([\\s\\S]*?)(?=^## |\\z)`, "m");
  return content.match(pattern)?.[1]?.trim() ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTableFirstColumn(text: string): string[] {
  const values: string[] = [];

  for (const line of text.split("\n")) {
    if (!line.startsWith("|")) continue;

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length === 0) continue;

    const first = cells[0]?.replace(/^`|`$/g, "").trim();
    if (!first || first === "---" || /^-+$/.test(first.replace(/`/g, ""))) continue;
    if (/^(field|type|flag|parameter|variable|capability)$/i.test(first)) continue;

    values.push(first);
  }

  return values;
}

function extractH2Headings(content: string): string[] {
  return [...content.matchAll(/^## (.+)$/gm)]
    .map((match) => match[1]?.trim())
    .filter((heading): heading is string => Boolean(heading));
}

function extractH3Headings(content: string): string[] {
  return [...content.matchAll(/^### (.+)$/gm)]
    .map((match) => match[1]?.trim())
    .filter((heading): heading is string => Boolean(heading));
}

function firstParagraph(content: string): string {
  const blocks = content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    if (block.startsWith("#")) continue;
    if (block.startsWith("|")) continue;
    if (block.startsWith("```")) continue;
    if (block.startsWith(">")) {
      return block
        .split("\n")
        .map((line) => line.replace(/^>\s?/, ""))
        .join(" ")
        .trim();
    }

    return block
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  return "";
}

function joinNotes(...parts: Array<string | undefined>): string {
  return parts.filter((part) => part && part.length > 0).join(" ");
}

function cliNotes(content: string): string {
  const actions = extractTableFirstColumn(extractSection(content, "Actions"));
  const platforms =
    content.match(/`--platform (web \| ios \| android)`/)?.[1] ?? "web, ios, android";

  return joinNotes(
    actions.length > 0 ? `Actions: ${actions.join(", ")}.` : undefined,
    `Platforms: ${platforms}.`,
    "Invoke as `node cli.js <action>` in a repo checkout or `BlackboxEditor --cli <action>` from a packaged build.",
  );
}

function mcpNotes(content: string): string {
  const toolsSection = extractSection(content, "Tools");
  const tools = extractTableFirstColumn(toolsSection);
  const patchOps = content.match(
    /`set_node`, `remove_node`, `set_choice`, `remove_choice`, `set_record`, `remove_record`/,
  );

  return joinNotes(
    tools.length > 0 ? `Tools: ${tools.join(", ")}.` : undefined,
    patchOps
      ? "Patch ops: set_node, remove_node, set_choice, remove_choice, set_record, remove_record."
      : undefined,
    "Localhost-only streamable HTTP with bearer auth; mutations require expectedRevision.",
  );
}

function grammarNotes(content: string): string {
  const documents = extractH3Headings(extractSection(content, "Documents")).map((heading) =>
    heading.replace(/^`([^`]+)`.*/, "$1"),
  );
  const concepts = extractH2Headings(content).filter(
    (heading) => heading !== "Documents" && heading !== "Conventions",
  );

  return joinNotes(
    documents.length > 0 ? `Documents: ${documents.join(", ")}.` : undefined,
    concepts.length > 0 ? `Concepts: ${concepts.join(", ")}.` : undefined,
    "Validate with lint_project; explore reachability with simulate_project.",
  );
}

function notesForDoc(doc: Doc): string {
  switch (doc.slug) {
    case "cli":
      return cliNotes(doc.content);
    case "mcp":
      return mcpNotes(doc.content);
    case "grammar":
      return grammarNotes(doc.content);
    default:
      return "";
  }
}

export function docLinkDescription(doc: Doc): string {
  const lede = firstParagraph(doc.content);
  const detail = notesForDoc(doc);
  return joinNotes(doc.description, lede, detail);
}

export function docTopicSummary(doc: Doc): string {
  const detail = notesForDoc(doc);
  return joinNotes(doc.title, detail || doc.description);
}
