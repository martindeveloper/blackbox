import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { resolvePlatformConfig, resolveProject } from "../../../../scripts/lib/adventure.mjs";
import { buildWebFaviconBundle } from "../../../../scripts/lib/platformIcons.mjs";
import { resolveWebDevAdventure, resolveWebWwwDir } from "./adventureDev.mjs";

export { resolveWebWwwDir };

function resolveWebIconEntry(projectRoot, value) {
  if (typeof value === "string") {
    return { source: path.resolve(projectRoot, value), destName: path.basename(value) };
  }
  if (value && typeof value === "object" && typeof value.path === "string") {
    return {
      source: path.resolve(projectRoot, value.path),
      destName: typeof value.dest === "string" ? value.dest : path.basename(value.path),
    };
  }
  return null;
}

export function resolveWebIconSources(env = process.env) {
  const adventure = resolveWebDevAdventure(env);
  if (!adventure) return null;

  const project = resolveProject(adventure.adventureRoot);
  const web = resolvePlatformConfig(project, "web");
  if (!web.icon) return null;

  const extras = [];
  for (const [key, value] of Object.entries(web.icons ?? {})) {
    if (key === "favicon") continue;
    const entry = resolveWebIconEntry(project.root, value);
    if (entry) extras.push({ key, ...entry });
  }

  return { favicon: web.icon, extras };
}

export async function buildWebIcons(env = process.env, { wwwDir = resolveWebWwwDir(env) } = {}) {
  const sources = resolveWebIconSources(env);
  if (!sources) {
    console.warn(
      "==> skipping web icons: set BLACKBOX_ADVENTURE and platforms.web.icon in scenario.json",
    );
    return false;
  }

  if (!existsSync(sources.favicon)) {
    throw new Error(`Web favicon not found: ${sources.favicon}`);
  }

  mkdirSync(wwwDir, { recursive: true });
  await buildWebFaviconBundle(sources.favicon, wwwDir);

  for (const extra of sources.extras) {
    if (!existsSync(extra.source)) {
      throw new Error(`Web icon asset not found (${extra.key}): ${extra.source}`);
    }
    cpSync(extra.source, path.join(wwwDir, extra.destName));
  }

  const extraNames = sources.extras.map((item) => item.destName);
  console.log(
    `==> built web icons from ${path.basename(sources.favicon)} -> ${wwwDir}` +
      (extraNames.length ? ` (+ ${extraNames.join(", ")})` : ""),
  );
  return true;
}
