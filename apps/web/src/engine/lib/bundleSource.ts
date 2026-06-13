import { bundleStore, type BundleLoadProgress, type ProjectBundleInfo } from "./bundleStore.js";
import type { ContentSource } from "./contentSourceTypes.js";
import { engineText } from "./localization.js";
import { logger } from "./logger.js";
import { requireWasmPkg, type BlackboxEngine } from "./wasmHost.js";

const CONTENT_SCENARIO = "content/scenario";
const CONTENT_ITEMS = "content/items";
const CONTENT_CHARACTERS = "content/characters";
const CONTENT_ASSETS = "content/assets";
const CONTENT_CHAPTERS_PREFIX = "content/chapters/";
const loadedChapters = new WeakMap<BlackboxEngine, Set<string>>();

function requireBytes(path: string): Uint8Array {
  const bytes = bundleStore.read(path);
  if (!bytes) throw new Error(engineText("errors.bundleContentMissing", { path }));
  return bytes;
}

function chapterPath(chapterId: string): string {
  return `${CONTENT_CHAPTERS_PREFIX}${chapterId}`;
}

export const assetUrl: ContentSource["assetUrl"] = (src) => bundleStore.getBlobUrl(src);

export const hasAsset: ContentSource["hasAsset"] = (src) => bundleStore.hasEntry(src);

export const fetchAudioBytes: ContentSource["fetchAudioBytes"] = async (src) =>
  bundleStore.read(src);

export const projectInfo: ContentSource["projectInfo"] = () => bundleStore.projectInfo;

export const diagnostics: ContentSource["diagnostics"] = () => bundleStore.diagnostics;

export const loadContent: ContentSource["loadContent"] = (bundlePath, onProgress) =>
  bundleStore.load(bundlePath, onProgress);

export const loadSourceBundle: ContentSource["loadSourceBundle"] = () => {
  if (!bundleStore.loaded) throw new Error(engineText("errors.bundleNotLoaded"));
  return {
    scenario: requireBytes(CONTENT_SCENARIO),
    items: requireBytes(CONTENT_ITEMS),
    characters: requireBytes(CONTENT_CHARACTERS),
    assets: requireBytes(CONTENT_ASSETS),
    project: bundleStore.projectInfo ?? undefined,
  };
};

export const createSourceEngine: ContentSource["createSourceEngine"] = (
  bundle,
  randomSeedOverride,
) => {
  const { BlackboxEngine: EngineCtor } = requireWasmPkg();
  const engine = new EngineCtor(
    bundle.scenario,
    bundle.items,
    bundle.characters,
    bundle.assets,
    bundleStore.listPaths(CONTENT_CHAPTERS_PREFIX).map((path) => requireBytes(path)),
    bundleStore.libraryBytes ?? undefined,
    randomSeedOverride,
  );
  loadedChapters.set(engine, new Set(bundleStore.chapterPartIds()));
  const catalog = bundleStore.catalogBytes;
  if (catalog) engine.loadCatalog(catalog);
  return engine;
};

export const ensureSourceChapter: ContentSource["ensureSourceChapter"] = (chapterId) =>
  bundleStore.ensureChapter(chapterId);

export const sourceLoadedChapters: ContentSource["sourceLoadedChapters"] = (engine) => {
  let ids = loadedChapters.get(engine);
  if (!ids) {
    ids = new Set(bundleStore.chapterPartIds());
    loadedChapters.set(engine, ids);
  }
  return ids;
};

export const loadSourceChapter: ContentSource["loadSourceChapter"] = async (engine, chapterId) => {
  const ids = sourceLoadedChapters(engine);
  if (ids.has(chapterId)) return;

  await bundleStore.ensureChapter(chapterId);
  try {
    engine.loadChapter(requireBytes(chapterPath(chapterId)));
  } catch (error) {
    try {
      engine.unloadChapter(chapterId);
    } catch (unloadError) {
      logger.debug("engine", "Failed to roll back partial chapter load", {
        chapterId,
        error: String(unloadError),
      });
    }
    throw error;
  }
  ids.add(chapterId);
};

export const unloadSourceChapter: ContentSource["unloadSourceChapter"] = (engine, chapterId) => {
  engine.unloadChapter(chapterId);
  sourceLoadedChapters(engine).delete(chapterId);
};

export const sourceScenarioLabel: ContentSource["sourceScenarioLabel"] = () =>
  bundleStore.meta?.scenario;

export const logSourceDiagnostics: ContentSource["logSourceDiagnostics"] = (bundle) => {
  const meta = bundleStore.meta;
  logger.debug("engine", "Scenario bundle ready for WASM msgpack decode", {
    platform: meta?.platform,
    scenario: meta?.scenario,
    bytes: {
      scenario: bundle.scenario.byteLength,
      items: bundle.items.byteLength,
      characters: bundle.characters.byteLength,
      assets: bundle.assets.byteLength,
      chapters: bundleStore
        .listPaths(CONTENT_CHAPTERS_PREFIX)
        .map((path) => requireBytes(path).byteLength),
    },
  });
};

export const submitAfterLoadingAllChapters: ContentSource["submitAfterLoadingAllChapters"] = (
  engine,
  submit,
) => {
  const project = bundleStore.projectInfo;
  if (!project) return Promise.resolve(submit());

  return (async () => {
    let result = submit();
    for (const chapter of project.chapters) {
      if (result.ok || result.error?.type !== "unknownNode") break;
      if (sourceLoadedChapters(engine).has(chapter.id)) continue;
      await loadSourceChapter(engine, chapter.id);
      result = submit();
    }
    return result;
  })();
};

export type { ProjectBundleInfo, BundleLoadProgress };
