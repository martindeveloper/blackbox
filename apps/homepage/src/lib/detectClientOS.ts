export type ClientOS = "macos" | "windows";

export function detectClientOS(userAgent: string): ClientOS {
  if (/Windows NT|Win32|Win64|Windows/.test(userAgent)) {
    return "windows";
  }

  return "macos";
}
