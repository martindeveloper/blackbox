export const GITHUB_REPO = "martindeveloper/blackbox";

/** GitHub release tag or `latest` once releases are published. */
export const RELEASE_TAG = "latest";

export const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;

export type DownloadPlatform = "macos" | "windows" | "linux";
export type DownloadArch = "arm64" | "x64";
export type LinuxFormat = "appimage" | "deb";

export const PLATFORM_ARCHES: Record<DownloadPlatform, readonly DownloadArch[]> = {
  macos: ["arm64", "x64"],
  windows: ["arm64", "x64"],
  linux: ["x64"],
};

const ASSET_FILENAMES = {
  macos: {
    arm64: "blackbox-editor-macos-arm64.dmg",
    x64: "blackbox-editor-macos-x64.dmg",
  },
  windows: {
    arm64: "blackbox-editor-windows-arm64.zip",
    x64: "blackbox-editor-windows-x64.zip",
  },
  linux: {
    x64: {
      appimage: "blackbox-editor-linux-x64.AppImage",
      deb: "blackbox-editor-linux-x64.deb",
    },
  },
} as const;

export function releaseAssetFilename(
  platform: DownloadPlatform,
  arch: DownloadArch,
  linuxFormat: LinuxFormat = "appimage",
): string {
  if (platform === "linux") {
    return ASSET_FILENAMES.linux.x64[linuxFormat];
  }

  return ASSET_FILENAMES[platform][arch];
}

export function releaseDownloadUrl(
  platform: DownloadPlatform,
  arch: DownloadArch,
  linuxFormat: LinuxFormat = "appimage",
  tag: string = RELEASE_TAG,
): string {
  const filename = releaseAssetFilename(platform, arch, linuxFormat);
  return `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`;
}

export function releaseChecksumUrl(tag: string = RELEASE_TAG): string {
  return `https://github.com/${GITHUB_REPO}/releases/download/${tag}/SHA256SUMS`;
}
