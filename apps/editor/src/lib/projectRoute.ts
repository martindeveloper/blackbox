import type { NavigateOptions } from "@tanstack/react-router";
import { useParams } from "@tanstack/react-router";
import { useScenarioStore } from "../store/useScenarioStore.js";

export function projectIdFromStore(): string | null {
  return useScenarioStore.getState().projectId;
}

export function useEditorProjectId(): string | null {
  const params = useParams({ strict: false });
  const fromRoute = typeof params.projectId === "string" ? params.projectId : null;
  return fromRoute ?? projectIdFromStore();
}

export function cleanSearch<T extends Record<string, unknown>>(search: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(search)) {
    if (value != null && value !== false) {
      out[key] = value;
    }
  }
  return out as Partial<T>;
}

type EditorNavigate = (options: NavigateOptions) => Promise<void>;

function routeNeedsProjectId(to: NavigateOptions["to"]): boolean {
  return typeof to === "string" && to.includes("$projectId");
}

export function editorNavigate(
  navigate: EditorNavigate,
  options: NavigateOptions,
  projectId?: string | null,
) {
  const id = projectId ?? projectIdFromStore();
  const params =
    routeNeedsProjectId(options.to) && id
      ? { projectId: id, ...(options.params as Record<string, string> | undefined) }
      : options.params;

  const search =
    options.search === undefined
      ? options.search
      : typeof options.search === "function"
        ? options.search
        : cleanSearch(options.search as Record<string, unknown>);

  return navigate({ ...options, params, search });
}
