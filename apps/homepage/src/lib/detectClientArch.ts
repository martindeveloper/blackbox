import type { ClientOS } from "./detectClientOS";
import type { DownloadArch } from "./releaseAssets";

interface NavigatorUAData {
  getHighEntropyValues(hints: string[]): Promise<{ architecture?: string }>;
}

function navigatorUAData(): NavigatorUAData | undefined {
  return (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
}

export function detectClientArchFromUserAgent(userAgent: string): DownloadArch {
  if (/aarch64|arm64|ARM64|Win64;\s*ARM|Windows\s+ARM/i.test(userAgent)) {
    return "arm64";
  }

  return "x64";
}

function detectMacAppleSiliconFromWebGL(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
    if (!gl || !(gl instanceof WebGLRenderingContext)) {
      return false;
    }

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (!debugInfo) {
      return false;
    }

    const renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
    return /Apple M\d+/i.test(renderer);
  } catch {
    return false;
  }
}

export async function detectClientArch(
  userAgent: string,
  platform: ClientOS,
): Promise<DownloadArch> {
  if (detectClientArchFromUserAgent(userAgent) === "arm64") {
    return "arm64";
  }

  const uaData = typeof navigator !== "undefined" ? navigatorUAData() : undefined;
  if (uaData) {
    try {
      const { architecture } = await uaData.getHighEntropyValues(["architecture"]);
      if (architecture === "arm") {
        return "arm64";
      }
      if (architecture === "x86") {
        return "x64";
      }
    } catch {
      // Fall through to platform-specific heuristics.
    }
  }

  if (platform === "macos" && detectMacAppleSiliconFromWebGL()) {
    return "arm64";
  }

  return "x64";
}
