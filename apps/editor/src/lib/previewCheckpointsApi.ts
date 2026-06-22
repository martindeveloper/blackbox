import type { PreviewCheckpointPayload } from "@players/web/protocol.js";
import { PREVIEW_CHECKPOINT_FORMAT } from "@players/web/protocol.js";
import { ProjectRoutes, projectApiUrl } from "@shared/apiPaths.js";

export const CHECKPOINT_SCHEMA_VERSION = 1 as const;

export interface PreviewCheckpointSummary {
  id: string;
  createdAt: string;
  nodeId: string | null;
  chapterId: string | null;
  location: string | null;
}

export interface StoredPreviewCheckpoint extends PreviewCheckpointSummary {
  format: typeof PREVIEW_CHECKPOINT_FORMAT;
  version: typeof CHECKPOINT_SCHEMA_VERSION;
  storage: Record<string, unknown>;
  engineState: string;
}

export interface PreviewCheckpointListResponse {
  checkpoints: PreviewCheckpointSummary[];
}

export interface PreviewCheckpointResponse {
  checkpoint: StoredPreviewCheckpoint;
}

function parseStoredPreviewCheckpoint(value: unknown): StoredPreviewCheckpoint {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid checkpoint response");
  }
  const record = value as Record<string, unknown>;
  if (record.format !== PREVIEW_CHECKPOINT_FORMAT) {
    throw new Error("Invalid checkpoint format");
  }
  if (record.version !== CHECKPOINT_SCHEMA_VERSION) {
    throw new Error("Unsupported checkpoint version");
  }
  const id = typeof record.id === "string" ? record.id : "";
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : "";
  const storage = record.storage;
  const engineState = typeof record.engineState === "string" ? record.engineState.trim() : "";
  if (
    !id ||
    !createdAt ||
    !storage ||
    typeof storage !== "object" ||
    Array.isArray(storage) ||
    engineState.length === 0
  ) {
    throw new Error("Invalid checkpoint payload");
  }
  return {
    format: PREVIEW_CHECKPOINT_FORMAT,
    version: CHECKPOINT_SCHEMA_VERSION,
    id,
    createdAt,
    nodeId: typeof record.nodeId === "string" ? record.nodeId : null,
    chapterId: typeof record.chapterId === "string" ? record.chapterId : null,
    location: typeof record.location === "string" ? record.location : null,
    storage: storage as Record<string, unknown>,
    engineState,
  };
}

export function toCheckpointSummary(checkpoint: StoredPreviewCheckpoint): PreviewCheckpointSummary {
  const { format: _f, version: _v, storage: _s, engineState: _e, ...summary } = checkpoint;
  return summary;
}

export function toCheckpointPayload(checkpoint: StoredPreviewCheckpoint): PreviewCheckpointPayload {
  return {
    storage: checkpoint.storage,
    engineState: checkpoint.engineState,
    nodeId: checkpoint.nodeId ?? undefined,
    chapterId: checkpoint.chapterId ?? undefined,
    location: checkpoint.location ?? undefined,
  };
}

export async function listPreviewCheckpoints(
  projectId: string,
): Promise<PreviewCheckpointListResponse> {
  const res = await fetch(projectApiUrl(projectId, ProjectRoutes.PreviewCheckpoints));
  if (!res.ok) throw new Error(`Failed to load checkpoints (${res.status})`);
  return res.json() as Promise<PreviewCheckpointListResponse>;
}

export async function createPreviewCheckpoint(
  projectId: string,
  payload: PreviewCheckpointPayload,
): Promise<PreviewCheckpointResponse> {
  const res = await fetch(projectApiUrl(projectId, ProjectRoutes.PreviewCheckpoints), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to save checkpoint (${res.status})`);
  }
  const body = (await res.json()) as { checkpoint?: unknown };
  if (!body.checkpoint) throw new Error("Invalid checkpoint response");
  return { checkpoint: parseStoredPreviewCheckpoint(body.checkpoint) };
}

export async function readPreviewCheckpoint(
  projectId: string,
  checkpointId: string,
): Promise<PreviewCheckpointResponse> {
  const res = await fetch(
    projectApiUrl(
      projectId,
      `${ProjectRoutes.PreviewCheckpoints}/${encodeURIComponent(checkpointId)}`,
    ),
  );
  if (!res.ok) throw new Error(`Failed to load checkpoint (${res.status})`);
  const body = (await res.json()) as { checkpoint?: unknown };
  if (!body.checkpoint) throw new Error("Invalid checkpoint response");
  return { checkpoint: parseStoredPreviewCheckpoint(body.checkpoint) };
}

export async function deletePreviewCheckpoint(
  projectId: string,
  checkpointId: string,
): Promise<void> {
  const res = await fetch(
    projectApiUrl(
      projectId,
      `${ProjectRoutes.PreviewCheckpoints}/${encodeURIComponent(checkpointId)}`,
    ),
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Failed to delete checkpoint (${res.status})`);
}
