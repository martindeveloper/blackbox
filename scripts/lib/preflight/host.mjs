import { spawn } from "node:child_process";
import { commandExistsAsync } from "../spawn.mjs";

function readFfmpegEncoders() {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-encoders"], {
      stdio: ["ignore", "pipe", "ignore"],
      shell: process.platform === "win32",
      ...(process.platform === "win32" ? { windowsHide: true } : {}),
    });
    let stdout = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", () => resolve(""));
    child.on("close", (code) => resolve(code === 0 ? stdout.toLowerCase() : ""));
  });
}

/** Per-request cache for host tool probes shared across platform/stage checks. */
export function createHostCache() {
  const commands = new Map();
  let encoders;

  return {
    commandExists(command) {
      if (!commands.has(command)) {
        commands.set(command, commandExistsAsync(command));
      }
      return commands.get(command);
    },
    ffmpegEncoders() {
      if (encoders === undefined) {
        encoders = readFfmpegEncoders();
      }
      return encoders;
    },
  };
}
