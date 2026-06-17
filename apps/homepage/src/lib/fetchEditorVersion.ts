import { cacheLife } from "next/cache";
import { FALLBACK_RELEASE_TAG, GITHUB_REPO } from "./releaseAssets";

const SITE_URL = "https://www.onbbx.com";

export type EditorVersionInfo = {
  version: string;
  releaseUrl: string;
  downloadUrl: string;
};

function downloadPageUrl(version: string): string {
  return `${SITE_URL}/download?version=${encodeURIComponent(version)}`;
}

function editorVersionInfo(
  version: string,
  releaseUrl: string,
): EditorVersionInfo {
  return {
    version,
    releaseUrl,
    downloadUrl: downloadPageUrl(version),
  };
}

function fallbackEditorVersion(): EditorVersionInfo {
  return editorVersionInfo(
    FALLBACK_RELEASE_TAG,
    `https://github.com/${GITHUB_REPO}/releases/tag/${FALLBACK_RELEASE_TAG}`,
  );
}

export async function fetchEditorVersion(): Promise<EditorVersionInfo> {
  "use cache";
  cacheLife("minutes");

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    );

    if (!response.ok) {
      return fallbackEditorVersion();
    }

    const data = (await response.json()) as {
      tag_name?: string;
      html_url?: string;
    };
    const version = data.tag_name ?? FALLBACK_RELEASE_TAG;
    const releaseUrl =
      data.html_url ??
      `https://github.com/${GITHUB_REPO}/releases/tag/${version}`;

    return editorVersionInfo(version, releaseUrl);
  } catch {
    return fallbackEditorVersion();
  }
}
