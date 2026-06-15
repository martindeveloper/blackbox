/** @typedef {{ command: string, probeArgs?: string[], args?: string[] }} IdeLauncher */

/** @type {Record<string, IdeLauncher[]>} */
const LAUNCHERS = {
  darwin: [
    {
      command: "open",
      probeArgs: ["-Ra", "Zed"],
      args: ["-a", "Zed"],
    },
    { command: "zed" },
  ],
  win32: [{ command: "zed" }],
  default: [{ command: "zed" }, { command: "zeditor" }],
};

function launchersForPlatform(platform) {
  return LAUNCHERS[platform] ?? LAUNCHERS.default;
}

export const zedPlugin = {
  id: "zed",

  async isAvailable(spawn) {
    for (const launcher of launchersForPlatform(process.platform)) {
      if (await spawn.isLauncherAvailable(launcher)) return true;
    }
    return false;
  },

  open(projectPath, spawn) {
    return spawn.openFirstLauncher(launchersForPlatform(process.platform), projectPath);
  },
};
