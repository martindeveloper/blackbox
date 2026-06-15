/** @typedef {{ command: string, probeArgs?: string[], args?: string[] }} IdeLauncher */

/** @type {Record<string, IdeLauncher[]>} */
const LAUNCHERS = {
  darwin: [
    {
      command: "open",
      probeArgs: ["-Ra", "Visual Studio Code"],
      args: ["-a", "Visual Studio Code"],
    },
    { command: "code" },
  ],
  win32: [{ command: "code.cmd" }, { command: "code" }],
  default: [{ command: "code" }],
};

function launchersForPlatform(platform) {
  return LAUNCHERS[platform] ?? LAUNCHERS.default;
}

export const vscodePlugin = {
  id: "vscode",

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
