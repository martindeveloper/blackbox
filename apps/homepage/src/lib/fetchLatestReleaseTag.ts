import { FALLBACK_RELEASE_TAG, GITHUB_REPO } from "./releaseAssets";

export async function fetchLatestReleaseTag(): Promise<string> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { next: { revalidate: 3600 } },
    );

    if (!response.ok) {
      return FALLBACK_RELEASE_TAG;
    }

    const data = (await response.json()) as { tag_name?: string };
    return data.tag_name ?? FALLBACK_RELEASE_TAG;
  } catch {
    return FALLBACK_RELEASE_TAG;
  }
}
