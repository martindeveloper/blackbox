import { VERSION_API } from "../../shared/versionApi.js";
import { isNewerVersion } from "../../shared/releaseVersion.js";
import { EDITOR_VERSION } from "./version.js";

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

async function fetchVersionPayload(signal?: AbortSignal): Promise<{
  editor?: Partial<EditorVersionInfo>;
}> {
  if (window.electronAPI?.fetchEditorVersion) {
    return window.electronAPI.fetchEditorVersion(signal);
  }

  const response = await fetch(VERSION_API, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Version check failed (${response.status})`);
  }

  return (await response.json()) as { editor?: Partial<EditorVersionInfo> };
}

export async function checkForUpdate(signal?: AbortSignal): Promise<UpdateCheckResult> {
  const data = await fetchVersionPayload(signal);
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
