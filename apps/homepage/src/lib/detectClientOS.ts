import type { DownloadPlatform } from "./releaseAssets";

export type ClientOS = DownloadPlatform;

export function detectClientOS(userAgent: string): ClientOS {
  if (/Windows NT|Win32|Win64|Windows/.test(userAgent)) {
    return "windows";
  }

  if (/Linux|X11|CrOS/.test(userAgent)) {
    return "linux";
  }

  return "macos";
}
