import type { SessionPhase } from "../hooks/useBlackboxSession.js";

export type PageTitleContext =
  | { kind: "boot" }
  | { kind: "menu"; scenarioTitle?: string }
  | { kind: "game"; scenarioTitle?: string; chapterTitle?: string };

export function formatPageTitle(ctx: PageTitleContext, brand: string): string {
  switch (ctx.kind) {
    case "boot":
      return brand;
    case "menu":
      return ctx.scenarioTitle?.trim() || brand;
    case "game": {
      const scenario = ctx.scenarioTitle?.trim();
      const chapter = ctx.chapterTitle?.trim();
      if (chapter && scenario) return `${chapter} | ${scenario}`;
      if (scenario) return scenario;
      return brand;
    }
  }
}

export function pageTitleContextFromSession(
  session: SessionPhase,
  scenarioTitleFromProject?: string,
): PageTitleContext {
  if (session.phase === "loading" || session.phase === "error") {
    return { kind: "boot" };
  }

  if (session.phase === "selecting_slot") {
    return { kind: "menu", scenarioTitle: scenarioTitleFromProject };
  }

  if (session.phase === "ready") {
    return {
      kind: "game",
      scenarioTitle: session.view.scenario_title ?? scenarioTitleFromProject,
      chapterTitle: session.view.chapter_title,
    };
  }

  return { kind: "boot" };
}
