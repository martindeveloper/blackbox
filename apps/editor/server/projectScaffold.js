import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { PREVIEW_WEB_ROOT } from "./config.js";
import { collectIdeGitignoreEntries, ensureIdeProjectSettings } from "./idePlugins/index.js";
import {
  exampleCharactersDoc,
  exampleIntroChapterDoc,
  exampleItemsDoc,
  exampleMetaCatalogDoc,
  exampleScenarioDoc,
  exampleSecondChapterDoc,
  exampleSecondChapterId,
} from "./exampleContent.js";
import {
  starterAppCssDoc,
  starterAppTsxDoc,
  starterGameTsDoc,
  starterReadmeDoc,
} from "./starterCode.js";

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

async function writeTextIfMissing(filePath, contents) {
  try {
    await fs.access(filePath);
    return false;
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents);
    return true;
  }
}

export function defaultFontsCssDoc() {
  return "/* Web fonts: apps/web/README.md#web-fonts */\n";
}

export async function ensureGameFontsCss(projectPath) {
  const srcDir = path.join(projectPath, "src");
  const hasCustomCode =
    existsSync(path.join(srcDir, "game.ts")) || existsSync(path.join(srcDir, "app.css"));
  if (!hasCustomCode && !existsSync(path.join(srcDir, "fonts.css"))) {
    return false;
  }
  return writeTextIfMissing(path.join(srcDir, "fonts.css"), defaultFontsCssDoc());
}

async function writeProjectTree(projectPath, jsonFiles, extra = []) {
  await fs.mkdir(projectPath, { recursive: true });
  await Promise.all([
    ...jsonFiles.map(([relative, value]) => writeJson(path.join(projectPath, relative), value)),
    ...extra,
  ]);
}

function baseProjectJsonFiles({ items, characters, assets, library, cook, catalog } = {}) {
  return [
    ["items.json", items ?? emptyItemsDoc()],
    ["characters.json", characters ?? emptyCharactersDoc()],
    ["assets.json", assets ?? emptyAssetsDoc()],
    [DEFAULT_LIBRARY_REF, library ?? emptyLibraryDoc()],
    [DEFAULT_COOK_REF, cook ?? defaultBundleCookDoc()],
    ...(catalog ? [["catalog.json", catalog]] : []),
  ];
}

/** Scaffold starter custom-code files into `src/` without clobbering existing files. */
export async function bootstrapStarterCode(projectPath) {
  const gameId = path.basename(projectPath);
  const files = [
    ["src/game.ts", starterGameTsDoc(gameId)],
    ["src/App.tsx", starterAppTsxDoc()],
    ["src/app.css", starterAppCssDoc()],
    ["src/fonts.css", defaultFontsCssDoc()],
    ["src/README.md", starterReadmeDoc()],
  ];
  const created = [];
  for (const [relative, contents] of files) {
    const wrote = await writeTextIfMissing(path.join(projectPath, relative), contents);
    if (wrote) created.push(relative);
  }
  return created;
}

async function ensureDevGitignore(projectPath) {
  const target = path.join(projectPath, ".gitignore");
  const existing = await fs.readFile(target, "utf8").catch(() => "");
  const missing = collectIdeGitignoreEntries().filter(
    (entry) => !existing.split(/\r?\n/).includes(entry),
  );
  if (missing.length === 0) return false;
  const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  const block = `${prefix}\n# Machine-local IDE files generated by Blackbox Editor\n${missing.join("\n")}\n`;
  await fs.writeFile(target, existing + block);
  return true;
}

/**
 * Generate machine-local IDE files that point at the engine SDK shipped with
 * the editor. `PREVIEW_WEB_ROOT` is apps/web in development and the bundled
 * preview-workspace in packaged builds, including Windows MSIX installs.
 */
export async function ensureProjectIdeSetup(projectPath, sdkRoot = PREVIEW_WEB_ROOT) {
  try {
    const sdkTsconfig = path.join(sdkRoot, "tsconfig.game.json");
    if (!existsSync(sdkTsconfig)) return false;
    const extendsPath = path.resolve(sdkTsconfig).split(path.sep).join("/");
    const contents = `{
  // Generated by the editor for IDE tooling — do not commit. See .gitignore.
  "extends": "${extendsPath}",
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
`;
    const target = path.join(projectPath, "tsconfig.json");
    const existing = await fs.readFile(target, "utf8").catch(() => null);
    let changed = false;
    if (existing !== contents) {
      await fs.writeFile(target, contents);
      changed = true;
    }

    const typescriptLibCandidates = [
      path.join(sdkRoot, "node_modules", "typescript", "lib"),
      path.join(sdkRoot, "pkg", "node_modules", "typescript", "lib"),
    ];
    const typescriptLib = typescriptLibCandidates.find((candidate) => existsSync(candidate));
    if (typescriptLib) {
      changed = (await ensureIdeProjectSettings(projectPath, typescriptLib)) || changed;
    }
    changed = (await ensureDevGitignore(projectPath)) || changed;
    return changed;
  } catch {
    return false;
  }
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
    ensureGameFontsCss(projectPath),
  ]);

  return scenario;
}

async function writeExampleProject(projectPath, { title, firstChapterId, firstChapterTitle }) {
  const secondChapterId = exampleSecondChapterId(firstChapterId);
  const introRef = `chapter_${firstChapterId}.json`;
  const secondRef = `chapter_${secondChapterId}.json`;

  await writeProjectTree(
    projectPath,
    [
      [
        "scenario.json",
        exampleScenarioDoc({
          title,
          firstChapterId,
          firstChapterTitle,
          introRef,
          secondChapterId,
          secondRef,
          libraryRef: DEFAULT_LIBRARY_REF,
          cookRef: DEFAULT_COOK_REF,
        }),
      ],
      [
        introRef,
        exampleIntroChapterDoc({ id: firstChapterId, title: firstChapterTitle, secondChapterId }),
      ],
      [secondRef, exampleSecondChapterDoc({ id: secondChapterId, introChapterId: firstChapterId })],
      ...baseProjectJsonFiles({
        items: exampleItemsDoc(),
        characters: exampleCharactersDoc(),
        catalog: exampleMetaCatalogDoc(),
      }),
    ],
    [ensureProjectMediaDirs(projectPath)],
  );
}

export async function writeNewProject(
  projectPath,
  { title, firstChapterId, firstChapterTitle, withExample = false },
) {
  if (withExample) {
    await writeExampleProject(projectPath, { title, firstChapterId, firstChapterTitle });
    return;
  }

  const chapterRef = `chapter_${firstChapterId}.json`;
  const startNodeId = `${firstChapterId}_start`;

  await writeProjectTree(
    projectPath,
    [
      ["scenario.json", newScenarioDoc({ title, firstChapterId, firstChapterTitle, chapterRef })],
      [chapterRef, newChapterDoc({ id: firstChapterId, title: firstChapterTitle, startNodeId })],
      ...baseProjectJsonFiles(),
    ],
    [
      ensureProjectMediaDirs(projectPath),
      writeTextIfMissing(path.join(projectPath, "src", "fonts.css"), defaultFontsCssDoc()),
    ],
  );
}
