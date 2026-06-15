import { spawn } from "node:child_process";
import fs from "node:fs/promises";

export function createIdeSpawn() {
  function run(command, args) {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        detached: false,
        stdio: "ignore",
        windowsHide: true,
      });
      child.once("error", () => resolve(false));
      child.once("close", (code) => resolve(code === 0));
    });
  }

  async function isLauncherAvailable(launcher) {
    if (launcher.probeArgs) return run(launcher.command, launcher.probeArgs);
    const probe =
      process.platform === "win32"
        ? ["where.exe", [launcher.command]]
        : ["sh", ["-lc", `command -v "$1" >/dev/null 2>&1`, "sh", launcher.command]];
    return run(probe[0], probe[1]);
  }

  async function openFirstLauncher(launchers, projectPath) {
    for (const launcher of launchers) {
      if (!(await isLauncherAvailable(launcher))) continue;
      if (await run(launcher.command, [...(launcher.args ?? []), projectPath])) return true;
    }
    return false;
  }

  async function openCustomBinary(command, projectPath) {
    return run(command, [projectPath]);
  }

  return { isLauncherAvailable, openFirstLauncher, openCustomBinary };
}

export async function isCustomIdeAvailable(customPath) {
  if (typeof customPath !== "string" || !customPath.trim()) return false;
  const resolved = customPath.trim();
  try {
    await fs.access(resolved);
    const stat = await fs.stat(resolved);
    return stat.isFile();
  } catch {
    return false;
  }
}
