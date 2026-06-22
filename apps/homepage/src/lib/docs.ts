import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const DOCS_DIR = path.join(process.cwd(), "content/docs");

export type Doc = {
  slug: string;
  title: string;
  description: string;
  order: number;
  content: string;
};

function readDoc(slug: string): Doc {
  const source = fs.readFileSync(path.join(DOCS_DIR, `${slug}.md`), "utf8");
  const { data, content } = matter(source);
  return {
    slug,
    title: typeof data.title === "string" ? data.title : slug,
    description: typeof data.description === "string" ? data.description : "",
    order: typeof data.order === "number" ? data.order : 0,
    content: content.trim(),
  };
}

export function getDoc(slug: string): Doc {
  const file = path.join(DOCS_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) throw new Error(`Doc not found: ${slug}`);
  return readDoc(slug);
}

export function listDocs(): Doc[] {
  return fs
    .readdirSync(DOCS_DIR)
    .filter((name) => name.endsWith(".md"))
    .map((name) => readDoc(name.slice(0, -3)))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}
