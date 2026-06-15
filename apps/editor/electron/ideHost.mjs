import { DEFAULT_IDE_ID } from "../shared/ideRegistry.js";
import { getIdePlugin } from "./idePlugins/index.mjs";
import { createIdeSpawn } from "./ideSpawn.mjs";

export async function openInIde(projectPath, ideId = DEFAULT_IDE_ID) {
  const plugin = getIdePlugin(ideId);
  if (!plugin) return false;
  return plugin.open(projectPath, createIdeSpawn());
}
