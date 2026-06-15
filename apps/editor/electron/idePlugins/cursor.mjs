/** @typedef {{ command: string, probeArgs?: string[], args?: string[] }} IdeLauncher */

/** @type {Record<string, IdeLauncher[]>} */
const LAUNCHERS = {
  darwin: [
    {
      command: "open",
      probeArgs: ["-Ra", "Cursor"],
      args: ["-a", "Cursor"],
    },
    { command: "cursor" },
  ],
  win32: [{ command: "cursor.cmd" }, { command: "cursor" }],
  default: [{ command: "cursor" }],
};

function launchersForPlatform(platform) {
  return LAUNCHERS[platform] ?? LAUNCHERS.default;
}

export const cursorPlugin = {
  id: "cursor",

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
