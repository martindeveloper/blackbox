import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_LIBRARY_REF = "library.json";
export const DEFAULT_COOK_REF = "bundle.cook.json";

/** Default on-disk media layout for new projects (matches silent_archive_game). */
export const PROJECT_MEDIA_DIRS = [
  "textures/backgrounds",
  "textures/icons",
  "textures/characters",
  "music",
  "sfx",
];

export function emptyItemsDoc() {
  return { spec: "com.blackbox.items", formatVersion: 1, items: {} };
}

export function emptyCharactersDoc() {
  return { spec: "com.blackbox.characters", formatVersion: 1, characters: {} };
}

export function emptyAssetsDoc() {
  return {
    spec: "com.blackbox.assets.bundle",
    formatVersion: 1,
    textures: {},
    music: {},
    sfx: {},
  };
}

export function emptyLibraryDoc() {
  return {
    spec: "com.blackbox.library",
    formatVersion: 1,
    snippets: {},
    templates: {},
    conditions: {},
  };
}

export function defaultBundleCookDoc() {
  return {
    spec: "com.blackbox.bundle.cook",
    formatVersion: 1,
    patterns: [
      {
        match: "textures/backgrounds/**",
        texture: {
          resize: { maxWidth: 1280, maxHeight: 720 },
          webpQuality: 80,
        },
      },
      {
        match: "textures/icons/**",
        texture: {
          resize: { maxWidth: 256, maxHeight: 256 },
        },
      },
      {
        match: "textures/characters/**",
        texture: {
          resize: { maxWidth: 512, maxHeight: 512 },
        },
      },
    ],
    platforms: {
      web: {
        texture: {
          webpQuality: 85,
        },
      },
    },
  };
}

export function newScenarioDoc({ title, firstChapterId, firstChapterTitle, chapterRef }) {
  return {
    spec: "com.blackbox.scenario",
    formatVersion: 1,
    title,
    revision: "1.0",
    randomSeed: Math.floor(Math.random() * 65536),
    itemsRef: "items.json",
    charactersRef: "characters.json",
    assetsRef: "assets.json",
    libraryRef: DEFAULT_LIBRARY_REF,
    cookRef: DEFAULT_COOK_REF,
    chapters: [{ id: firstChapterId, title: firstChapterTitle, ref: chapterRef }],
  };
}

export function newChapterDoc({ id, title, startNodeId }) {
  return {
    spec: "com.blackbox.chapter",
    formatVersion: 1,
    id,
    title,
    startNodeId,
    nodes: {
      [startNodeId]: {
        id: startNodeId,
        title,
        text: [{ kind: "paragraph", text: "Your story begins here." }],
        choices: [],
      },
    },
  };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeIfMissing(filePath, value) {
  try {
    await fs.access(filePath);
    return false;
  } catch {
    await writeJson(filePath, value);
    return true;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

/** Create the standard textures/music/sfx folder tree when absent. */
export async function ensureProjectMediaDirs(projectPath) {
  await Promise.all(
    PROJECT_MEDIA_DIRS.map((relative) => ensureDir(path.join(projectPath, relative))),
  );
}

async function ensureScenarioRefs(projectPath, scenario) {
  const libraryRef = scenario.libraryRef ?? DEFAULT_LIBRARY_REF;
  const cookRef = scenario.cookRef ?? DEFAULT_COOK_REF;
  const needsPatch =
    scenario.libraryRef !== libraryRef ||
    scenario.cookRef !== cookRef ||
    !scenario.libraryRef ||
    !scenario.cookRef;
  const next = { ...scenario, libraryRef, cookRef };
  if (needsPatch) {
    await writeJson(path.join(projectPath, "scenario.json"), next);
  }
  return next;
}

/** Write default sidecars, cook rules, and media folders when a project is missing them. */
export async function ensureProjectSidecars(projectPath, scenario = null) {
  if (!scenario) {
    const text = await fs.readFile(path.join(projectPath, "scenario.json"), "utf8");
    scenario = JSON.parse(text);
  }

  scenario = await ensureScenarioRefs(projectPath, scenario);

  await Promise.all([
    writeIfMissing(path.join(projectPath, scenario.itemsRef ?? "items.json"), emptyItemsDoc()),
    writeIfMissing(
      path.join(projectPath, scenario.charactersRef ?? "characters.json"),
      emptyCharactersDoc(),
    ),
    writeIfMissing(path.join(projectPath, scenario.assetsRef ?? "assets.json"), emptyAssetsDoc()),
    writeIfMissing(
      path.join(projectPath, scenario.libraryRef ?? DEFAULT_LIBRARY_REF),
      emptyLibraryDoc(),
    ),
    writeIfMissing(
      path.join(projectPath, scenario.cookRef ?? DEFAULT_COOK_REF),
      defaultBundleCookDoc(),
    ),
    ensureProjectMediaDirs(projectPath),
  ]);

  return scenario;
}

/** Scaffold a brand-new project folder with scenario, chapter, sidecars, and media dirs. */
export async function writeNewProject(projectPath, { title, firstChapterId, firstChapterTitle }) {
  const chapterRef = `chapter_${firstChapterId}.json`;
  const startNodeId = `${firstChapterId}_start`;

  await fs.mkdir(projectPath, { recursive: true });
  await Promise.all([
    writeJson(
      path.join(projectPath, "scenario.json"),
      newScenarioDoc({ title, firstChapterId, firstChapterTitle, chapterRef }),
    ),
    writeJson(
      path.join(projectPath, chapterRef),
      newChapterDoc({ id: firstChapterId, title: firstChapterTitle, startNodeId }),
    ),
    writeJson(path.join(projectPath, "items.json"), emptyItemsDoc()),
    writeJson(path.join(projectPath, "characters.json"), emptyCharactersDoc()),
    writeJson(path.join(projectPath, "assets.json"), emptyAssetsDoc()),
    writeJson(path.join(projectPath, DEFAULT_LIBRARY_REF), emptyLibraryDoc()),
    writeJson(path.join(projectPath, DEFAULT_COOK_REF), defaultBundleCookDoc()),
    ensureProjectMediaDirs(projectPath),
  ]);
}
