import { EDITOR_VERSION } from "./version.js";

const VERSION_API = "https://www.onbbx.com/api/v1/version";

export interface EditorVersionInfo {
  version: string;
  releaseUrl: string;
  downloadUrl: string;
}

export interface UpdateCheckResult {
  latest: EditorVersionInfo;
  current: string;
  updateAvailable: boolean;
}

function versionParts(value: string): number[] {
  return value
    .trim()
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
}

/** Returns true when `latest` is a strictly newer semantic version than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = versionParts(latest);
  const b = versionParts(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

export async function checkForUpdate(signal?: AbortSignal): Promise<UpdateCheckResult> {
  const response = await fetch(VERSION_API, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Version check failed (${response.status})`);
  }

  const data = (await response.json()) as { editor?: Partial<EditorVersionInfo> };
  const editor = data.editor;
  if (!editor?.version || !editor.downloadUrl) {
    throw new Error("Version response missing editor information");
  }

  const latest: EditorVersionInfo = {
    version: editor.version,
    releaseUrl: editor.releaseUrl ?? editor.downloadUrl,
    downloadUrl: editor.downloadUrl,
  };

  return {
    latest,
    current: EDITOR_VERSION,
    updateAvailable: isNewerVersion(latest.version, EDITOR_VERSION),
  };
}
