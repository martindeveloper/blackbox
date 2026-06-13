import type { PreviewDocsPayload } from "../engine/lib/previewSource.js";

export function readPreviewParams(): { apiBase: string; projectId: string } {
  const params = new URLSearchParams(globalThis.location.search);
  const projectId = params.get("project");
  if (!projectId) {
    throw new Error("Preview requires a ?project=<id> parameter");
  }
  return { apiBase: params.get("api") ?? "/api/v1", projectId };
}

export async function fetchPreviewDocs(
  apiBase: string,
  projectId: string,
): Promise<PreviewDocsPayload> {
  const url = `${apiBase}/projects/${encodeURIComponent(projectId)}/preview-docs`;
  const response = await fetch(url);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Failed to load project (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return (await response.json()) as PreviewDocsPayload;
}

export function subscribePreviewHotReload(apiBase: string, projectId: string): void {
  const source = new EventSource(`${apiBase}/projects/${encodeURIComponent(projectId)}/events`);
  let initial = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  source.onmessage = () => {
    if (initial) {
      initial = false;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => globalThis.location.reload(), 250);
  };
}
