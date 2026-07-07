import { cacheLife, cacheTag } from "next/cache";
import { EDITOR_VERSION_CACHE_TAG } from "./fetchEditorVersion";
import { FALLBACK_RELEASE_TAG, GITHUB_REPO } from "./releaseAssets";

export type ReleaseArchiveEntry = {
  tag: string;
  publishedAt: string | null;
  releaseUrl: string;
  prerelease: boolean;
};

function fallbackReleaseArchive(): ReleaseArchiveEntry[] {
  return [
    {
      tag: FALLBACK_RELEASE_TAG,
      publishedAt: null,
      releaseUrl: `https://github.com/${GITHUB_REPO}/releases/tag/${FALLBACK_RELEASE_TAG}`,
      prerelease: false,
    },
  ];
}

export async function fetchReleaseArchive(): Promise<ReleaseArchiveEntry[]> {
  "use cache";
  cacheLife("days");
  cacheTag(EDITOR_VERSION_CACHE_TAG);

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=50`,
    );

    if (!response.ok) {
      return fallbackReleaseArchive();
    }

    const data = (await response.json()) as Array<{
      tag_name?: string;
      published_at?: string | null;
      html_url?: string;
      draft?: boolean;
      prerelease?: boolean;
    }>;

    const releases = data
      .filter((release) => !release.draft && release.tag_name)
      .map((release) => ({
        tag: release.tag_name!,
        publishedAt: release.published_at ?? null,
        releaseUrl:
          release.html_url ?? `https://github.com/${GITHUB_REPO}/releases/tag/${release.tag_name}`,
        prerelease: release.prerelease ?? false,
      }));

    return releases.length > 0 ? releases : fallbackReleaseArchive();
  } catch {
    return fallbackReleaseArchive();
  }
}
