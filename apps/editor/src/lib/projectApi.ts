import { Api } from "./api.js";
import type { MediaFileEntry } from "./mediaLibrary.js";
import type { LoadedBundle } from "./scenarioLoader.js";
import type { TrashEntry } from "./trash.js";

export interface ProjectSummary {
  id: string;
  name: string;
  title: string | null;
  path: string;
  revision: number;
  lastOpened: string | null;
}

export interface RootFileEntry {
  name: string;
  path: string;
  spec: string | null;
}

export interface ProjectSnapshot {
  project: ProjectSummary;
  bundle: LoadedBundle;
  mediaFiles: MediaFileEntry[];
  trashItems: TrashEntry[];
  rootFiles: RootFileEntry[];
}

export interface ProjectEvent {
  revision: number;
  changedPaths: string[];
  source?: "api" | "external";
  clientId?: string | null;
}

const CLIENT_ID = crypto.randomUUID();

export class ApiError extends Error {
  code: string;
  currentRevision?: number;

  constructor(code: string, message: string, currentRevision?: number) {
    super(message);
    this.code = code;
    this.currentRevision = currentRevision;
  }
}

function projectUrl(projectId: string, suffix = ""): string {
  return `${Api.Projects}/${encodeURIComponent(projectId)}${suffix}`;
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & {
    code?: string;
    message?: string;
    currentRevision?: number;
  };
  if (!response.ok) {
    throw new ApiError(
      body.code ?? "request_failed",
      body.message ?? `HTTP ${response.status}`,
      body.currentRevision,
    );
  }
  return body;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  return responseJson<T>(
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const result = await responseJson<{ projects: ProjectSummary[] }>(await fetch(Api.Projects));
  return result.projects;
}

export async function registerProject(projectPath: string): Promise<ProjectSummary> {
  const result = await postJson<{ project: ProjectSummary }>(`${Api.Projects}/register`, {
    path: projectPath,
  });
  return result.project;
}

export interface CreateProjectOptions {
  parentPath: string;
  folderName: string;
  title: string;
  firstChapterId: string;
  firstChapterTitle: string;
}

export async function createProject(options: CreateProjectOptions): Promise<ProjectSummary> {
  const result = await postJson<{ project: ProjectSummary }>(`${Api.Projects}/create`, options);
  return result.project;
}

export async function deleteProject(projectId: string, confirmName: string): Promise<void> {
  await postJson(projectUrl(projectId, "/delete"), { confirmName });
}

export function openProject(projectId: string): Promise<ProjectSnapshot> {
  return postJson(projectUrl(projectId, "/open"), {});
}

export async function saveDocuments(
  projectId: string,
  baseRevision: number,
  documents: Record<string, unknown>,
  force = false,
): Promise<number> {
  const result = await responseJson<{ revision: number }>(
    await fetch(projectUrl(projectId, "/documents"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseRevision, documents, force, clientId: CLIENT_ID }),
    }),
  );
  return result.revision;
}

export async function uploadMedia(
  projectId: string,
  baseRevision: number,
  targetDir: string,
  file: File,
): Promise<{ path: string; revision: number; mediaFiles: MediaFileEntry[] }> {
  const form = new FormData();
  form.set("baseRevision", String(baseRevision));
  form.set("targetDir", targetDir);
  form.set("clientId", CLIENT_ID);
  form.set("file", file);
  return responseJson(await fetch(projectUrl(projectId, "/media"), { method: "POST", body: form }));
}

export function mediaUrl(projectId: string, relativePath: string, revision: number): string {
  const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
  return `${projectUrl(projectId, `/media/${encoded}`)}?revision=${revision}`;
}

export function trashMedia(
  projectId: string,
  baseRevision: number,
  relativePath: string,
): Promise<{ revision: number; mediaFiles: MediaFileEntry[]; trashItems: TrashEntry[] }> {
  return postJson(projectUrl(projectId, "/media/trash"), {
    baseRevision,
    relativePath,
    clientId: CLIENT_ID,
  });
}

export function restoreTrash(
  projectId: string,
  baseRevision: number,
  entryId: string,
  overwrite: boolean,
): Promise<{ revision: number; mediaFiles: MediaFileEntry[]; trashItems: TrashEntry[] }> {
  return postJson(projectUrl(projectId, "/trash/restore"), {
    baseRevision,
    entryId,
    overwrite,
    clientId: CLIENT_ID,
  });
}

export function deleteTrash(
  projectId: string,
  baseRevision: number,
  entryId: string,
): Promise<{ revision: number; trashItems: TrashEntry[] }> {
  return postJson(projectUrl(projectId, "/trash/delete"), {
    baseRevision,
    entryId,
    clientId: CLIENT_ID,
  });
}

export function emptyTrash(
  projectId: string,
  baseRevision: number,
): Promise<{ revision: number; trashItems: TrashEntry[] }> {
  return postJson(projectUrl(projectId, "/trash/empty"), { baseRevision, clientId: CLIENT_ID });
}

export function subscribeProject(
  projectId: string,
  onEvent: (event: ProjectEvent) => void,
): () => void {
  const events = new EventSource(projectUrl(projectId, "/events"));
  events.onmessage = (message) => {
    const event = JSON.parse(message.data) as ProjectEvent;
    if (event.clientId !== CLIENT_ID) onEvent(event);
  };
  return () => events.close();
}

export const projectApiUrl = projectUrl;
