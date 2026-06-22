/** @typedef {import("./types.mjs").PreflightContext} PreflightContext */
/** @typedef {import("./types.mjs").PreflightCheck} PreflightCheck */

/**
 * @param {PreflightContext} ctx
 * @param {{ iosAudio?: boolean }=} options
 * @returns {Promise<PreflightCheck[]>}
 */
export async function sharedBundleChecks(ctx, { iosAudio = false } = {}) {
  const checks = [];
  const ffmpegOk = await ctx.host.commandExists("ffmpeg");
  const cwebpOk = await ctx.host.commandExists("cwebp");

  if (!ffmpegOk) {
    checks.push({
      severity: "error",
      message: "ffmpeg not found",
      dependency: "ffmpeg",
    });
  }
  if (!cwebpOk) {
    checks.push({
      severity: "warning",
      message: "cwebp not found — textures may stay PNG-sized",
      dependency: "cwebp",
    });
  }
  if (ffmpegOk && iosAudio) {
    const encoders = await ctx.host.ffmpegEncoders();
    if (encoders && !encoders.includes("aac") && !encoders.includes("libfdk_aac")) {
      checks.push({
        severity: "warning",
        message: "ffmpeg lacks AAC encoder — iOS audio may fall back to MP3",
      });
    }
  }

  return checks;
}
