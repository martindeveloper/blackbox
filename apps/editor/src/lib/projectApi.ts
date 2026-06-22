import { Api, ProjectRoutes, projectApiUrl, projectMediaUrl } from "@shared/apiPaths.js";
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
  codeTrusted: boolean | null;
  hasCustomCode: boolean;
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
  source?: "api" | "external" | "mcp" | "vcs" | "git" | "remote";
  clientId?: string | null;
  contribution?: ProjectContribution;
}

export interface ProjectContribution {
  status: "applied" | "blocked";
  contributor: {
    kind: "agent" | "person" | "integration" | "system";
    name: string;
    version?: string | null;
  };
  changes?: ProjectChange[];
  changeCount?: number;
  changesTruncated?: boolean;
  review?: ProjectContributionReview;
}

export type ProjectContributionReview =
  | { type: "mcp-audit" }
  | { type: "vcs-diff"; provider: string; from?: string; to?: string }
  | { type: "external-diff"; changedPaths?: string[] };

export interface ProjectChange {
  action: "added" | "removed" | "edited";
  entity: string;
  id: string;
  parentId?: string;
  chapterId?: string;
}

export type VcsFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

export interface VcsFile {
  path: string;
  originalPath?: string;
  status: VcsFileStatus;
  stateLabel?: string | null;
}

export type VcsWorkflow = "distributed" | "centralized";
export type VcsOperationPlacement = "primary" | "footer" | "file";

export interface VcsOperation {
  label: string;
  busyLabel: string;
  successMessage: string;
  placement: VcsOperationPlacement;
  scope: "workspace" | "changes" | "selection";
  changesWorkspace?: boolean;
  requiresCleanEditor?: boolean;
  requiresMessage?: boolean;
  messagePlaceholder?: string;
  requiresChanges?: boolean;
}

export interface VcsFeatures {
  initialize: boolean;
  prepareMutation: boolean;
  history: boolean;
  checkout: boolean;
  revert: boolean;
  changelists: boolean;
  locking: boolean;
}

export interface VcsProviderInfo {
  id: string;
  label: string;
  workflow: VcsWorkflow;
  operations: Record<string, VcsOperation>;
  features: VcsFeatures;
  available: boolean;
  version: string | null;
  detected: boolean;
}

export interface VcsWorkspace {
  label?: string | null;
  trackingLabel?: string | null;
  ahead?: number;
  behind?: number;
}

export interface VcsOperationState {
  enabled: boolean;
  reason?: string | null;
}

export interface VcsStatus {
  configured: boolean;
  provider: string | null;
  activeProvider?: Omit<VcsProviderInfo, "available" | "version" | "detected">;
  providers: VcsProviderInfo[];
  unavailable?: boolean;
  initialized?: boolean;
  workspace?: VcsWorkspace;
  operationStates?: Record<string, VcsOperationState>;
  files?: VcsFile[];
}

export interface VcsHistoryEntry {
  id: string;
  shortId: string;
  authorName: string;
  authorEmail: string;
  occurredAt: string;
  summary: string;
}

const CLIENT_ID = crypto.randomUUID();

export class ApiError extends Error {
  code: string;
  currentRevision?: number;
  projectVersion?: string;
  editorVersion?: string;

  constructor(
    code: string,
    message: string,
    details?: {
      currentRevision?: number;
      projectVersion?: string;
      editorVersion?: string;
    },
  ) {
    super(message);
    this.code = code;
    this.currentRevision = details?.currentRevision;
    this.projectVersion = details?.projectVersion;
    this.editorVersion = details?.editorVersion;
  }
}

function projectUrl(projectId: string, suffix = ""): string {
  return projectApiUrl(projectId, suffix);
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & {
    code?: string;
    message?: string;
    currentRevision?: number;
    projectVersion?: string;
    editorVersion?: string;
  };
  if (!response.ok) {
    throw new ApiError(body.code ?? "request_failed", body.message ?? `HTTP ${response.status}`, {
      currentRevision: body.currentRevision,
      projectVersion: body.projectVersion,
      editorVersion: body.editorVersion,
    });
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
  const result = await postJson<{ project: ProjectSummary }>(Api.ProjectsRegister, {
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
  withCode?: boolean;
  withExample?: boolean;
}

export async function createProject(options: CreateProjectOptions): Promise<ProjectSummary> {
  const result = await postJson<{ project: ProjectSummary }>(Api.ProjectsCreate, options);
  return result.project;
}

export async function deleteProject(projectId: string, confirmName: string): Promise<void> {
  await postJson(projectUrl(projectId, ProjectRoutes.Delete), { confirmName });
}

export function openProject(
  projectId: string,
  acceptEditorVersion = false,
): Promise<ProjectSnapshot> {
  return postJson(projectUrl(projectId, ProjectRoutes.Open), { acceptEditorVersion });
}

export async function setProjectCodeTrust(projectId: string, trusted: boolean): Promise<void> {
  await postJson<{ trusted: boolean }>(projectUrl(projectId, ProjectRoutes.TrustCode), {
    trusted,
  });
}

export async function bootstrapProjectCode(projectId: string): Promise<string[]> {
  const result = await postJson<{ created: string[] }>(
    projectUrl(projectId, ProjectRoutes.BootstrapCode),
    {},
  );
  return result.created;
}

export async function revokeAllProjectCodeTrust(): Promise<number> {
  const result = await postJson<{ revoked: number }>(Api.ProjectsRevokeCodeTrust, {});
  return result.revoked;
}

export async function saveDocuments(
  projectId: string,
  baseRevision: number,
  documents: Record<string, unknown>,
  force = false,
): Promise<number> {
  const result = await responseJson<{ revision: number }>(
    await fetch(projectUrl(projectId, ProjectRoutes.Documents), {
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
  return responseJson(
    await fetch(projectUrl(projectId, ProjectRoutes.Media), { method: "POST", body: form }),
  );
}

export function mediaUrl(projectId: string, relativePath: string, revision: number): string {
  return projectMediaUrl(projectId, relativePath, revision);
}

export function trashMedia(
  projectId: string,
  baseRevision: number,
  relativePath: string,
): Promise<{ revision: number; mediaFiles: MediaFileEntry[]; trashItems: TrashEntry[] }> {
  return postJson(projectUrl(projectId, ProjectRoutes.MediaTrash), {
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
  return postJson(projectUrl(projectId, ProjectRoutes.TrashRestore), {
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
  return postJson(projectUrl(projectId, ProjectRoutes.TrashDelete), {
    baseRevision,
    entryId,
    clientId: CLIENT_ID,
  });
}

export function emptyTrash(
  projectId: string,
  baseRevision: number,
): Promise<{ revision: number; trashItems: TrashEntry[] }> {
  return postJson(projectUrl(projectId, ProjectRoutes.TrashEmpty), {
    baseRevision,
    clientId: CLIENT_ID,
  });
}

export function subscribeProject(
  projectId: string,
  onEvent: (event: ProjectEvent) => void,
  { includeOwnClient = false }: { includeOwnClient?: boolean } = {},
): () => void {
  const events = new EventSource(projectUrl(projectId, ProjectRoutes.Events));
  events.onmessage = (message) => {
    const event = JSON.parse(message.data) as ProjectEvent;
    if (includeOwnClient || event.clientId !== CLIENT_ID) onEvent(event);
  };
  return () => events.close();
}

export async function getVcsStatus(projectId: string): Promise<VcsStatus> {
  return responseJson<VcsStatus>(await fetch(projectUrl(projectId, ProjectRoutes.VcsStatus)));
}

export async function configureVcs(
  projectId: string,
  provider: string,
  initialize: boolean,
): Promise<VcsStatus> {
  return responseJson<VcsStatus>(
    await fetch(projectUrl(projectId, ProjectRoutes.Vcs), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, initialize }),
    }),
  );
}

export function executeVcsOperation(
  projectId: string,
  operation: string,
  payload: { message?: string; paths?: string[] } = {},
): Promise<{ operation: string; result: unknown; status: VcsStatus }> {
  return postJson(
    projectUrl(projectId, `${ProjectRoutes.VcsOperations}/${encodeURIComponent(operation)}`),
    payload,
  );
}

export async function getVcsHistory(
  projectId: string,
  filePath?: string,
): Promise<VcsHistoryEntry[]> {
  const query = new URLSearchParams({ limit: "50" });
  if (filePath) query.set("path", filePath);
  const result = await responseJson<{ revisions: VcsHistoryEntry[] }>(
    await fetch(`${projectUrl(projectId, ProjectRoutes.VcsHistory)}?${query}`),
  );
  return result.revisions;
}

export { projectApiUrl } from "@shared/apiPaths.js";
