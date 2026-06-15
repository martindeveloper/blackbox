import type { CommandResult, ScenarioBundle } from "../types/game.js";
import type { BundleLoadProgress, ProjectBundleInfo } from "./bundleStore.js";
import type { BlackboxEngine } from "./wasmHost.js";

export interface ContentSource {
  assetUrl(src: string): string | null;
  hasAsset(src: string): boolean;
  fetchAudioBytes(src: string): Promise<Uint8Array | null>;
  projectInfo(): ProjectBundleInfo | null;
  diagnostics(): Record<string, unknown> | null;
  loadContent(
    bundlePath: string,
    onProgress: (progress: BundleLoadProgress) => void,
  ): Promise<void>;
  loadSourceBundle(): ScenarioBundle;
  createSourceEngine(
    bundle: ScenarioBundle,
    randomSeedOverride: bigint | undefined,
  ): BlackboxEngine;
  ensureSourceChapter(chapterId: string): Promise<void>;
  sourceLoadedChapters(engine: BlackboxEngine): Set<string>;
  loadSourceChapter(engine: BlackboxEngine, chapterId: string): Promise<void>;
  unloadSourceChapter(engine: BlackboxEngine, chapterId: string): void;
  sourceScenarioLabel(): string | undefined;
  logSourceDiagnostics(bundle: ScenarioBundle): void;
  submitAfterLoadingAllChapters(
    engine: BlackboxEngine,
    submit: () => CommandResult,
  ): Promise<CommandResult>;
}
