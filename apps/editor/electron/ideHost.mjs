import { CUSTOM_IDE_ID, DEFAULT_IDE_ID } from "../shared/ideRegistry.js";
import { getIdePlugin, listIdePlugins } from "./idePlugins/index.mjs";
import { createIdeSpawn, isCustomIdeAvailable } from "./ideSpawn.mjs";

export async function probeIdes(customPath) {
  const spawn = createIdeSpawn();
  const plugins = await Promise.all(
    listIdePlugins().map(async (plugin) => ({
      id: plugin.id,
      available: await plugin.isAvailable(spawn),
    })),
  );
  return {
    plugins,
    customAvailable: await isCustomIdeAvailable(customPath),
  };
}

export async function openInIde(projectPath, ideId = DEFAULT_IDE_ID, customPath) {
  if (ideId === CUSTOM_IDE_ID) {
    if (!(await isCustomIdeAvailable(customPath))) return false;
    return createIdeSpawn().openCustomBinary(customPath.trim(), projectPath);
  }
  const plugin = getIdePlugin(ideId);
  if (!plugin) return false;
  return plugin.open(projectPath, createIdeSpawn());
}
