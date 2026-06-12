export type ActivityView =
  | "dashboard"
  | "media"
  | "scenario"
  | "graph"
  | "items"
  | "characters"
  | "assets"
  | "meta"
  | "library"
  | "tools"
  | "about";

export const enum Page {
  Home = "/",
  Resume = "/resume/$projectId",
  EditorDashboard = "/editor/$projectId/dashboard",
  EditorMedia = "/editor/$projectId/media",
  EditorManifest = "/editor/$projectId/scenario",
  EditorGraph = "/editor/$projectId/graph",
  EditorItems = "/editor/$projectId/items",
  EditorCharacters = "/editor/$projectId/characters",
  EditorAssets = "/editor/$projectId/assets",
  EditorMeta = "/editor/$projectId/meta",
  EditorLibrary = "/editor/$projectId/library",
  EditorTools = "/editor/$projectId/tools",
  EditorAbout = "/editor/$projectId/about",
}

export const ACTIVITY_PAGES: Record<ActivityView, Page> = {
  dashboard: Page.EditorDashboard,
  media: Page.EditorMedia,
  scenario: Page.EditorManifest,
  graph: Page.EditorGraph,
  items: Page.EditorItems,
  characters: Page.EditorCharacters,
  assets: Page.EditorAssets,
  meta: Page.EditorMeta,
  library: Page.EditorLibrary,
  tools: Page.EditorTools,
  about: Page.EditorAbout,
};

function editorPagePattern(page: Page): RegExp {
  const escaped = page.replace(/\$projectId/g, "[^/]+").replace(/\//g, "\\/");
  return new RegExp(`^${escaped}(/|$)`);
}

export function isActiveEditorPage(pathname: string, page: Page): boolean {
  return editorPagePattern(page).test(pathname);
}
