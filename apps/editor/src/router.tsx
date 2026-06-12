import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { useScenarioStore } from "./store/useScenarioStore.js";
import { OpenFolderScreen } from "./components/welcome/OpenFolderScreen.js";
import { EditorShell } from "./components/layout/EditorShell.js";
import { MediaLibraryEditor } from "./components/media/MediaLibraryEditor.js";
import { ScenarioSettingsForm } from "./components/scenario/ScenarioSettingsForm.js";
import { ChapterGraph } from "./components/graph/ChapterGraph.js";
import { ItemsEditor } from "./components/catalogs/ItemsEditor.js";
import { CharactersEditor } from "./components/catalogs/CharactersEditor.js";
import { CatalogOverview } from "./components/catalogs/CatalogOverview.js";
import { MetaCatalogOverview } from "./components/catalogs/MetaCatalogOverview.js";
import { LibraryCatalogOverview } from "./components/catalogs/LibraryCatalogOverview.js";
import { ToolsEditor } from "./components/tools/ToolsEditor.js";
import { ProjectDashboard } from "./components/dashboard/ProjectDashboard.js";
import { AboutScreen } from "./components/about/AboutScreen.js";
import { Page } from "./lib/pages.js";
import { parseMediaCategory } from "./lib/mediaLibrary.js";
import { tryRestoreProject } from "./lib/projectRestore.js";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    const state = useScenarioStore.getState();
    if (state.bundle && state.projectId) {
      // params/search typed as `never` due to same-file router circular inference; correct at runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throw redirect({
        to: Page.EditorDashboard,
        params: { projectId: state.projectId } as any,
        search: {} as any,
      });
    }
  },
  component: OpenFolderScreen,
});

const resumeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/resume/$projectId",
  beforeLoad: async ({ params }) => {
    const state = useScenarioStore.getState();
    if (state.bundle && state.projectId === params.projectId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throw redirect({
        to: Page.EditorDashboard,
        params: { projectId: params.projectId } as any,
        search: {} as any,
      });
    }
    const restored = await tryRestoreProject(params.projectId);
    if (restored) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throw redirect({
        to: Page.EditorDashboard,
        params: { projectId: params.projectId } as any,
        search: {} as any,
      });
    }
  },
  component: OpenFolderScreen,
});

const editorProjectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/editor/$projectId",
  beforeLoad: async ({ params }) => {
    const state = useScenarioStore.getState();
    if (state.bundle && state.projectId === params.projectId) {
      return;
    }
    const restored = await tryRestoreProject(params.projectId);
    if (!restored) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throw redirect({
        to: Page.Resume,
        params: { projectId: params.projectId } as any,
        search: {} as any,
      });
    }
  },
  component: EditorShell,
});

const editorIndexRoute = createRoute({
  getParentRoute: () => editorProjectRoute,
  path: "/",
  beforeLoad: ({ params }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    throw redirect({
      to: Page.EditorDashboard,
      params: { projectId: params.projectId } as any,
      search: {} as any,
    });
  },
});

function optionalString(s: Record<string, unknown>, key: string): string | null {
  return typeof s[key] === "string" ? (s[key] as string) : null;
}

export const dashboardRoute = createRoute({
  getParentRoute: () => editorProjectRoute,
  path: "/dashboard",
  component: ProjectDashboard,
});

export const mediaRoute = createRoute({
  getParentRoute: () => editorProjectRoute,
  path: "/media",
  validateSearch: (s: Record<string, unknown>) => ({
    category: parseMediaCategory(s.category as string),
    folder: optionalString(s, "folder"),
    file: optionalString(s, "file"),
  }),
  component: MediaLibraryEditor,
});

export const scenarioRoute = createRoute({
  getParentRoute: () => editorProjectRoute,
  path: "/scenario",
  component: function ScenarioCanvas() {
    const bundle = useScenarioStore((s) => s.bundle);
    if (!bundle) return null;
    return (
      <div className="scenario-screen">
        <ScenarioSettingsForm expanded />
      </div>
    );
  },
});

export const graphRoute = createRoute({
  getParentRoute: () => editorProjectRoute,
  path: "/graph",
  validateSearch: (s: Record<string, unknown>) => ({
    chapter: optionalString(s, "chapter"),
    node: optionalString(s, "node"),
    globalNode: optionalString(s, "globalNode"),
  }),
  component: ChapterGraph,
});

export const itemsRoute = createRoute({
  getParentRoute: () => editorProjectRoute,
  path: "/items",
  validateSearch: (s: Record<string, unknown>) => ({
    item: optionalString(s, "item"),
  }),
  component: ItemsEditor,
});

export const charactersRoute = createRoute({
  getParentRoute: () => editorProjectRoute,
  path: "/characters",
  validateSearch: (s: Record<string, unknown>) => ({
    character: optionalString(s, "character"),
    filter: optionalString(s, "filter"),
  }),
  component: CharactersEditor,
});

export const assetsRoute = createRoute({
  getParentRoute: () => editorProjectRoute,
  path: "/assets",
  validateSearch: (s: Record<string, unknown>) => ({
    category: parseMediaCategory(s.category as string),
    key: optionalString(s, "key"),
  }),
  component: CatalogOverview,
});

export const metaRoute = createRoute({
  getParentRoute: () => editorProjectRoute,
  path: "/meta",
  validateSearch: (s: Record<string, unknown>) => ({
    metaKind: s.metaKind === "flag" ? ("flag" as const) : ("event" as const),
    metaEntry: optionalString(s, "metaEntry"),
  }),
  component: MetaCatalogOverview,
});

export const libraryRoute = createRoute({
  getParentRoute: () => editorProjectRoute,
  path: "/library",
  validateSearch: (s: Record<string, unknown>) => ({
    libraryKind:
      s.libraryKind === "template"
        ? ("template" as const)
        : s.libraryKind === "condition"
          ? ("condition" as const)
          : ("snippet" as const),
    libraryEntry: optionalString(s, "libraryEntry"),
  }),
  component: LibraryCatalogOverview,
});

export const toolsRoute = createRoute({
  getParentRoute: () => editorProjectRoute,
  path: "/tools",
  validateSearch: (s: Record<string, unknown>) => ({
    tool:
      s.tool === "bundle"
        ? ("bundle" as const)
        : s.tool === "simulator"
          ? ("simulator" as const)
          : s.tool === "linter"
            ? ("linter" as const)
            : null,
    run: s.run === true || s.run === 1 || s.run === "1" || s.run === "true" ? true : undefined,
  }),
  component: ToolsEditor,
});

export const aboutRoute = createRoute({
  getParentRoute: () => editorProjectRoute,
  path: "/about",
  component: AboutScreen,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  resumeRoute,
  editorProjectRoute.addChildren([
    editorIndexRoute,
    dashboardRoute,
    mediaRoute,
    scenarioRoute,
    graphRoute,
    itemsRoute,
    charactersRoute,
    assetsRoute,
    metaRoute,
    libraryRoute,
    toolsRoute,
    aboutRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
