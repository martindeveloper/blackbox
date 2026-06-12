import { mediaUrl } from "./projectApi.js";

export function getMediaUrl(
  projectId: string | null,
  relativePath: string | null,
  revision: number | null,
): string | null {
  if (!projectId || !relativePath || revision === null) return null;
  return mediaUrl(projectId, relativePath, revision);
}
