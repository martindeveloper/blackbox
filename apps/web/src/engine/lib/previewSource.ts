import type { CommandResult, ScenarioBundle } from "../types/game.js";
import type { BundleLoadProgress, ProjectBundleInfo } from "./bundleStore.js";
import type { ContentSource } from "./contentSourceTypes.js";
import { logger } from "./logger.js";
import { Profiler } from "./profiler.js";
import { requireWasmPkg, type BlackboxEngine } from "./wasmHost.js";

export interface PreviewChapter {
  id: string;
  title: string;
  json: string;
}

export interface PreviewProjectDocs {
  scenario: string;
  items: string;
  characters: string;
  assets: string;
  catalog?: string;
  library?: string;
  chapters: PreviewChapter[];
}

export interface PreviewSourceConfig {
  apiBase: string;
  projectId: string;
  revision: number;
  docs: PreviewProjectDocs;
}

export type PreviewDocsPayload = Omit<PreviewSourceConfig, "apiBase">;

function scenarioTitle(scenarioJson: string): string {
  try {
    const parsed = JSON.parse(scenarioJson) as { title?: unknown };
    return typeof parsed.title === "string" ? parsed.title : "Preview";
  } catch {
    return "Preview";
  }
}

class PreviewContentSource {
  readonly projectInfo: ProjectBundleInfo | null;
  readonly diagnostics: Record<string, unknown>;
  private readonly config: PreviewSourceConfig;
  private readonly profiledAssets = new Set<string>();
  private readonly loadedChapterIds: Set<string>;
  private jsonBundle: string | undefined;

  constructor(config: PreviewSourceConfig) {
    this.config = config;
    const { docs } = config;
    const title = scenarioTitle(docs.scenario);
    const startChapter = docs.chapters[0];
    this.loadedChapterIds = new Set(docs.chapters.map((chapter) => chapter.id));
    this.projectInfo = startChapter
      ? {
          title,
          revision: String(config.revision),
          chapters: docs.chapters.map((chapter) => ({
            id: chapter.id,
            title: chapter.title,
            meta: "",
            blob: "",
            dependencies: [],
          })),
          startChapterId: startChapter.id,
        }
      : null;
    this.diagnostics = {
      layout: "preview-json",
      title,
      projectId: config.projectId,
      revision: config.revision,
      chapters: docs.chapters.map((chapter) => chapter.id),
    };
    Profiler.event("scenario.loaded", "scenario.json", {
      revision: config.revision,
      chapters: docs.chapters.map((chapter) => chapter.id),
    });
    for (const chapter of docs.chapters) {
      Profiler.event("scenario.chapter_available", chapter.id, { title: chapter.title });
    }
  }

  private mediaUrl(src: string): string {
    const { apiBase, projectId, revision } = this.config;
    const encoded = src.split("/").map(encodeURIComponent).join("/");
    return `${apiBase}/projects/${encodeURIComponent(projectId)}/media/${encoded}?revision=${revision}`;
  }

  assetUrl(src: string): string | null {
    if (!src) return null;
    if (!this.profiledAssets.has(src)) {
      this.profiledAssets.add(src);
      Profiler.event("io.resolve", src, {
        kind: src.startsWith("textures/") ? "texture" : "asset",
      });
    }
    return this.mediaUrl(src);
  }

  hasAsset(_src: string): boolean {
    return true;
  }

  async fetchAudioBytes(src: string): Promise<Uint8Array | null> {
    Profiler.event("io.load", src, { kind: "audio" });
    try {
      const response = await fetch(this.mediaUrl(src));
      if (!response.ok) {
        Profiler.event("io.error", src, { kind: "audio", status: response.status });
        logger.error("audio", "Preview audio fetch failed", { src, status: response.status });
        return null;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      Profiler.event("io.loaded", src, { kind: "audio", bytes: bytes.byteLength });
      return bytes;
    } catch (error) {
      Profiler.event("io.error", src, { kind: "audio" });
      logger.error("audio", "Preview audio fetch threw", { src, error });
      return null;
    }
  }

  loadContent(
    _bundlePath: string,
    _onProgress: (progress: BundleLoadProgress) => void,
  ): Promise<void> {
    if (!contentLoader) throw new Error("Preview content loader is not configured");
    return contentLoader();
  }

  loadSourceBundle(): ScenarioBundle {
    const empty = new Uint8Array(0);
    return {
      scenario: empty,
      items: empty,
      characters: empty,
      assets: empty,
      project: this.projectInfo ?? undefined,
    };
  }

  createSourceEngine(
    _bundle: ScenarioBundle,
    randomSeedOverride: bigint | undefined,
  ): BlackboxEngine {
    const { docs } = this.config;
    const { BlackboxEngine } = requireWasmPkg();
    const EngineCtor = BlackboxEngine as typeof BlackboxEngine & {
      fromJsonBundle(bundle: string, randomSeedOverride?: bigint): BlackboxEngine;
    };
    Profiler.event("scenario.engine_built", "raw JSON documents", {
      freshStart: randomSeedOverride !== undefined,
      chapters: docs.chapters.length,
    });
    this.jsonBundle ??= JSON.stringify(docs);
    return EngineCtor.fromJsonBundle(this.jsonBundle, randomSeedOverride);
  }

  ensureSourceChapter(_chapterId: string): Promise<void> {
    return Promise.resolve();
  }

  sourceLoadedChapters(_engine: BlackboxEngine): Set<string> {
    return new Set(this.loadedChapterIds);
  }

  loadSourceChapter(_engine: BlackboxEngine, _chapterId: string): Promise<void> {
    return Promise.resolve();
  }

  unloadSourceChapter(_engine: BlackboxEngine, _chapterId: string): void {}

  sourceScenarioLabel(): string | undefined {
    return this.projectInfo?.title;
  }

  logSourceDiagnostics(_bundle: ScenarioBundle): void {}

  submitAfterLoadingAllChapters(
    _engine: BlackboxEngine,
    submit: () => CommandResult,
  ): Promise<CommandResult> {
    return Promise.resolve(submit());
  }
}

let source: PreviewContentSource;
let contentLoader: (() => Promise<void>) | undefined;

function activeSource(): PreviewContentSource {
  if (!source) throw new Error("Preview content is not configured");
  return source;
}

export function configurePreviewSource(config: PreviewSourceConfig): void {
  source = new PreviewContentSource(config);
}

export function configurePreviewLoader(loader: () => Promise<void>): void {
  contentLoader = loader;
}

export const assetUrl: ContentSource["assetUrl"] = (src) => activeSource().assetUrl(src);
export const hasAsset: ContentSource["hasAsset"] = (src) => activeSource().hasAsset(src);
export const fetchAudioBytes: ContentSource["fetchAudioBytes"] = (src) =>
  activeSource().fetchAudioBytes(src);
export const projectInfo: ContentSource["projectInfo"] = () => activeSource().projectInfo;
export const diagnostics: ContentSource["diagnostics"] = () => activeSource().diagnostics;
export const loadContent: ContentSource["loadContent"] = (_bundlePath, _onProgress) => {
  if (!contentLoader) throw new Error("Preview content loader is not configured");
  return contentLoader();
};
export const loadSourceBundle: ContentSource["loadSourceBundle"] = () =>
  activeSource().loadSourceBundle();
export const createSourceEngine: ContentSource["createSourceEngine"] = (bundle, seed) =>
  activeSource().createSourceEngine(bundle, seed);
export const ensureSourceChapter: ContentSource["ensureSourceChapter"] = (chapterId) =>
  activeSource().ensureSourceChapter(chapterId);
export const sourceLoadedChapters: ContentSource["sourceLoadedChapters"] = (engine) =>
  activeSource().sourceLoadedChapters(engine);
export const loadSourceChapter: ContentSource["loadSourceChapter"] = (engine, chapterId) =>
  activeSource().loadSourceChapter(engine, chapterId);
export const unloadSourceChapter: ContentSource["unloadSourceChapter"] = (engine, chapterId) =>
  activeSource().unloadSourceChapter(engine, chapterId);
export const sourceScenarioLabel: ContentSource["sourceScenarioLabel"] = () =>
  activeSource().sourceScenarioLabel();
export const logSourceDiagnostics: ContentSource["logSourceDiagnostics"] = (bundle) =>
  activeSource().logSourceDiagnostics(bundle);
export const submitAfterLoadingAllChapters: ContentSource["submitAfterLoadingAllChapters"] = (
  engine,
  submit,
) => activeSource().submitAfterLoadingAllChapters(engine, submit);

export type { ProjectBundleInfo, BundleLoadProgress };
