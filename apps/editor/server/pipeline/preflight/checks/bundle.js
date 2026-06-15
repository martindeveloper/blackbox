import { registerPreflightHook } from "../registry.js";
import { toolInstallHint } from "../helpers.js";

registerPreflightHook("bundle", ({ platform, host }) => {
  const checks = [];
  const ffmpegOk = host.commandExists("ffmpeg");
  const cwebpOk = host.commandExists("cwebp");

  if (!ffmpegOk) {
    checks.push({ severity: "error", message: toolInstallHint("ffmpeg", "ffmpeg") });
  }
  if (!cwebpOk) {
    checks.push({
      severity: "warning",
      message: `${toolInstallHint("cwebp", "webp")} — textures may stay PNG-sized`,
    });
  }
  if (ffmpegOk && platform === "ios") {
    const encoders = host.ffmpegEncoders();
    if (encoders && !encoders.includes("aac") && !encoders.includes("libfdk_aac")) {
      checks.push({
        severity: "warning",
        message: "ffmpeg lacks AAC encoder — iOS audio may fall back to MP3",
      });
    }
  }

  return checks;
});
