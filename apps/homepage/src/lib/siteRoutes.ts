import fs from "node:fs";
import path from "node:path";
import { listDocs } from "@/lib/docs";
import { absoluteUrl } from "@/lib/site";

const DOCS_DIR = path.join(process.cwd(), "content/docs");
const GAMES_DIR = path.join(process.cwd(), "app/games");

const STATIC_PATHS = ["/", "/editor", "/download", "/games"] as const;

export type SiteRoute = {
  path: string;
  lastModified?: Date;
};

export function docPath(slug: string): string {
  return slug === "index" ? "/docs" : `/docs/${slug}`;
}

function listGameRoutes(): SiteRoute[] {
  if (!fs.existsSync(GAMES_DIR)) return [];

  return fs
    .readdirSync(GAMES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(GAMES_DIR, entry.name, "page.tsx")))
    .map((entry) => ({ path: `/games/${entry.name}` }));
}

function listDocRoutes(): SiteRoute[] {
  return listDocs().map((doc) => ({
    path: docPath(doc.slug),
    lastModified: fs.statSync(path.join(DOCS_DIR, `${doc.slug}.md`)).mtime,
  }));
}

export function listSiteRoutes(): SiteRoute[] {
  return [...STATIC_PATHS.map((path) => ({ path })), ...listDocRoutes(), ...listGameRoutes()];
}

export function listSitemapEntries(): Array<{ url: string; lastModified?: Date }> {
  return listSiteRoutes().map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: route.lastModified,
  }));
}
