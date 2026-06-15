import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import toIco from "to-ico";
import { resolvePlatformConfig, resolveProject } from "../../../../scripts/lib/adventure.mjs";
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

/** Web icon paths from scenario.json `platforms.web` (null when no adventure or favicon configured). */
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

/** Copy favicon.svg, generate favicon.ico + game-icon.png, and copy extra web icon assets into www/. */
export async function buildWebIcons(env = process.env, { wwwDir = resolveWebWwwDir(env) } = {}) {
  const sources = resolveWebIconSources(env);
  if (!sources) {
    console.warn("==> skipping web icons: set BLACKBOX_ADVENTURE and platforms.web.icon in scenario.json");
    return false;
  }

  if (!existsSync(sources.favicon)) {
    throw new Error(`Web favicon not found: ${sources.favicon}`);
  }

  mkdirSync(wwwDir, { recursive: true });

  const favicon = readFileSync(sources.favicon);
  cpSync(sources.favicon, path.join(wwwDir, "favicon.svg"));

  const sizes = [16, 32, 48];
  await sharp(favicon).resize(1024, 1024).png().toFile(path.join(wwwDir, "game-icon.png"));

  const pngs = await Promise.all(
    sizes.map((size) => sharp(favicon).resize(size, size).png().toBuffer()),
  );
  writeFileSync(path.join(wwwDir, "favicon.ico"), await toIco(pngs));

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
