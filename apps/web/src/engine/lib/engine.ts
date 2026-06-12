import type {
  CommandResult,
  EngineError,
  GameView,
  ScenarioBundle,
  SfxCue,
} from "../types/game.js";
import { bundleStore } from "./bundleStore.js";
import { engineText } from "./localization.js";
import { logger, markWasmLoggingReady } from "./logger.js";
import { type BlackboxEngine, initWasm, requireWasmPkg } from "./wasmHost.js";

export type { BlackboxEngine };

export const DEFAULT_CHOICE_SFX = "sfx/click.wav";

export class EngineBusyError extends Error {
  constructor(operation: string) {
    super(`Engine is busy (${operation})`);
    this.name = "EngineBusyError";
  }
}

const engineBusy = new WeakMap<BlackboxEngine, boolean>();
const engineLoadedChapters = new WeakMap<BlackboxEngine, Set<string>>();
const engineViews = new WeakMap<BlackboxEngine, ViewSnapshot>();
const VIEW_PROTOCOL_VERSION = 1;

interface ViewSnapshot {
  revision: number;
  view: GameView;
}

interface ViewSnapshotWire {
  protocol: number;
  revision: number;
  view: unknown;
}

interface EventsDeltaWire {
  append?: string[];
  replace?: string[];
}

interface SparseArrayDeltaWire<T> {
  length?: number;
  set?: Array<{ index: number; value: T }>;
  replace?: T[];
}

interface CommandDeltaWire {
  protocol: number;
  ok: boolean;
  revision: number;
  baseRevision?: number;
  delta?: Record<string, unknown>;
  snapshot?: unknown;
  error?: EngineError | ViewRevisionMismatchError;
  selectedSfx?: SfxCue;
  triggeredSfx?: SfxCue;
  rolls?: CommandResult["rolls"];
  examine?: CommandResult["examine"];
  chapterChanged?: boolean;
}

interface ViewRevisionMismatchError {
  type: "viewRevisionMismatch";
  expected: number;
  received: number;
}

function withEngine<T>(engine: BlackboxEngine, operation: string, fn: () => T): T {
  if (engineBusy.get(engine)) {
    throw new EngineBusyError(operation);
  }
  engineBusy.set(engine, true);
  try {
    return fn();
  } finally {
    engineBusy.set(engine, false);
  }
}

const CONTENT_SCENARIO = "content/scenario";
const CONTENT_ITEMS = "content/items";
const CONTENT_CHARACTERS = "content/characters";
const CONTENT_ASSETS = "content/assets";
const CONTENT_CHAPTERS_PREFIX = "content/chapters/";

export function musicAssetLabel(src: string): string {
  return (src.split("/").pop() ?? src).replace(/\.[^/.]+$/, "").toUpperCase();
}

export function tryAssetUrl(src: string): string | null {
  return bundleStore.getBlobUrl(src);
}

export type StatusKind = "info" | "ready" | "error";

export interface BootResult {
  engine: BlackboxEngine;
  bundle: ScenarioBundle;
  view: GameView;
}

function chapterPath(chapterId: string): string {
  return `${CONTENT_CHAPTERS_PREFIX}${chapterId}`;
}

function loadedChapterIds(engine: BlackboxEngine): Set<string> {
  let ids = engineLoadedChapters.get(engine);
  if (!ids) {
    ids = new Set(bundleStore.chapterPartIds());
    engineLoadedChapters.set(engine, ids);
  }
  return ids;
}

function chapterBytesForEngine(): Uint8Array[] {
  return bundleStore.listPaths(CONTENT_CHAPTERS_PREFIX).map((path) => requireBytes(path));
}

async function loadChapterIntoEngine(engine: BlackboxEngine, chapterId: string): Promise<void> {
  if (loadedChapterIds(engine).has(chapterId)) return;

  await bundleStore.ensureChapter(chapterId);
  try {
    engine.loadChapter(requireBytes(chapterPath(chapterId)));
  } catch (error) {
    try {
      engine.unloadChapter(chapterId);
    } catch (unloadError) {
      logger.debug("engine", "Failed to roll back partial chapter load", {
        chapterId,
        error: toErrorMessage(unloadError),
      });
    }
    throw error;
  }
  loadedChapterIds(engine).add(chapterId);
}

function requireBytes(path: string): Uint8Array {
  const bytes = bundleStore.read(path);
  if (!bytes) {
    throw new Error(engineText("errors.bundleContentMissing", { path }));
  }
  return bytes;
}

function loadScenarioBundle(): ScenarioBundle {
  if (!bundleStore.loaded) {
    throw new Error(engineText("errors.bundleNotLoaded"));
  }

  return {
    scenario: requireBytes(CONTENT_SCENARIO),
    items: requireBytes(CONTENT_ITEMS),
    characters: requireBytes(CONTENT_CHARACTERS),
    assets: requireBytes(CONTENT_ASSETS),
    project: bundleStore.projectInfo ?? undefined,
  };
}

export async function ensureChapterLoaded(
  engine: BlackboxEngine,
  chapterId: string,
): Promise<void> {
  if (!bundleStore.projectInfo) return;
  await loadChapterIntoEngine(engine, chapterId);
}

type PlayerCommand =
  | { type: "choose"; choice_id: string }
  | { type: "continue" }
  | { type: "examine"; item_ref: string }
  | { type: "useItem"; item_ref: string; action_id: string };

function chapterIdsForCommand(command: PlayerCommand, view: GameView): string[] {
  if (command.type !== "choose") return [];

  const choice = view.choices.find((entry) => entry.id === command.choice_id);
  if (choice?.action?.type === "gotoChapter") {
    return [choice.action.chapterId];
  }
  return [];
}

export async function ensureChaptersForCommand(
  engine: BlackboxEngine,
  command: PlayerCommand,
  view: GameView,
): Promise<void> {
  if (!bundleStore.projectInfo) return;

  for (const chapterId of chapterIdsForCommand(command, view)) {
    await ensureChapterLoaded(engine, chapterId);
  }
}

export async function retryUnknownNodeCommand(
  engine: BlackboxEngine,
  command: PlayerCommand,
  view: GameView,
  submit: () => CommandResult,
): Promise<CommandResult> {
  await ensureChaptersForCommand(engine, command, view);
  let result = submit();
  if (result.ok || result.error?.type !== "unknownNode") {
    return result;
  }

  const project = bundleStore.projectInfo;
  if (!project) return result;

  for (const chapter of project.chapters) {
    if (loadedChapterIds(engine).has(chapter.id)) continue;
    await ensureChapterLoaded(engine, chapter.id);
    result = submit();
    if (result.ok || result.error?.type !== "unknownNode") {
      return result;
    }
  }

  return result;
}

export async function handleChapterTransition(
  engine: BlackboxEngine,
  previousChapterId: string | undefined,
  nextChapterId: string | undefined,
): Promise<void> {
  if (!bundleStore.projectInfo || !nextChapterId) return;

  await ensureChapterLoaded(engine, nextChapterId);

  if (previousChapterId && previousChapterId !== nextChapterId) {
    try {
      engine.unloadChapter(previousChapterId);
      loadedChapterIds(engine).delete(previousChapterId);
      logger.debug("engine", "Chapter transition unloaded engine chapter", {
        from: previousChapterId,
        to: nextChapterId,
        loadedChapters: bundleStore.chapterPartIds(),
      });
    } catch (error: unknown) {
      logger.debug("engine", "Skipped chapter unload", {
        previousChapterId,
        error: toErrorMessage(error),
      });
    }
  }
}

let bootResult: { bundle: ScenarioBundle } | null = null;
let bootPromise: Promise<{ bundle: ScenarioBundle }> | null = null;

export async function bootEngine(): Promise<{ bundle: ScenarioBundle }> {
  if (bootResult) return bootResult;
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    logger.info("engine", "Initializing WASM module…");
    try {
      await initWasm();
    } catch (error: unknown) {
      throw makeBootError(engineText("errors.wasmInitFailed"), error);
    }

    markWasmLoggingReady();

    const bundle = loadScenarioBundle();
    logBundleDiagnostics(bundle);
    logger.info("engine", "Bundle ready — awaiting slot selection", {
      scenario: bundleStore.meta?.scenario,
    });
    return { bundle };
  })();

  try {
    bootResult = await bootPromise;
    return bootResult;
  } catch (error) {
    bootPromise = null;
    throw error;
  }
}

export function randomGameSeed(): bigint {
  const words = new Uint32Array(2);
  crypto.getRandomValues(words);
  return (BigInt(words[0]!) << 32n) | BigInt(words[1]!);
}

export interface CreateEngineOptions {
  /** Web player: roll a new RNG seed instead of using the bundled scenario seed. */
  freshStart?: boolean;
}

function freshGameSeedOverride(): bigint {
  const seed = randomGameSeed();
  logger.debug("engine", "Generated random seed for fresh start", { seed: seed.toString() });
  return seed;
}

export function createEngine(
  bundle: ScenarioBundle,
  options: CreateEngineOptions = {},
): BlackboxEngine {
  try {
    const { BlackboxEngine: EngineCtor } = requireWasmPkg();
    const engine = new EngineCtor(
      bundle.scenario,
      bundle.items,
      bundle.characters,
      bundle.assets,
      chapterBytesForEngine(),
      bundleStore.libraryBytes ?? undefined,
      options.freshStart ? freshGameSeedOverride() : undefined,
    );
    engineLoadedChapters.set(engine, new Set(bundleStore.chapterPartIds()));
    const catalogBytes = bundleStore.catalogBytes;
    if (catalogBytes) {
      engine.loadCatalog(catalogBytes);
    }
    return engine;
  } catch (error: unknown) {
    throw makeBootError(engineText("errors.engineConstructorFailed"), error);
  }
}

function logBundleDiagnostics(bundle: ScenarioBundle): void {
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
}

export function makeBootError(stage: string, error: unknown): Error {
  const detail = toErrorMessage(error);
  const message = engineText("errors.bootStageDetail", { stage, detail });
  const wrapped = new Error(message);
  wrapped.name = "BootError";
  wrapped.cause = error instanceof Error ? error : undefined;
  return wrapped;
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "RuntimeError" && /unreachable/i.test(error.message)) {
      return engineText("errors.wasmPanic");
    }
    return error.message;
  }
  return String(error);
}

export function normalizeGameView(wire: unknown): GameView {
  const raw = wire as Record<string, unknown>;
  return {
    ...(raw as unknown as GameView),
    scenario_title: (raw.scenario_title ?? raw.scenarioTitle) as string | undefined,
    chapter_id: (raw.chapter_id ?? raw.chapterId) as string | undefined,
    chapter_title: (raw.chapter_title ?? raw.chapterTitle) as string | undefined,
  };
}

function requireRevision(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 0xffff_ffff) {
    throw new Error(`Invalid engine protocol ${field}`);
  }
  return value as number;
}

function requireProtocol(value: unknown): void {
  if (value !== VIEW_PROTOCOL_VERSION) {
    throw new Error(
      `Unsupported engine view protocol ${String(value)}; expected ${VIEW_PROTOCOL_VERSION}`,
    );
  }
}

function parseViewSnapshot(wire: unknown): ViewSnapshot {
  if (!wire || typeof wire !== "object") {
    throw new Error("Invalid engine view snapshot");
  }
  const raw = wire as Partial<ViewSnapshotWire>;
  requireProtocol(raw.protocol);
  if (!raw.view) {
    throw new Error("Engine view snapshot is missing its view");
  }
  return {
    revision: requireRevision(raw.revision, "revision"),
    view: normalizeGameView(raw.view),
  };
}

function optionalString(value: unknown): string | undefined {
  return (value as string | null) ?? undefined;
}

function normalizeViewDelta(delta: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...delta };
  if ("scenarioTitle" in normalized) {
    normalized.scenario_title = normalized.scenarioTitle;
    delete normalized.scenarioTitle;
  }
  if ("chapterId" in normalized) {
    normalized.chapter_id = normalized.chapterId;
    delete normalized.chapterId;
  }
  if ("chapterTitle" in normalized) {
    normalized.chapter_title = normalized.chapterTitle;
    delete normalized.chapterTitle;
  }
  return normalized;
}

function applyTextDelta(
  current: GameView["text"],
  wire: SparseArrayDeltaWire<GameView["text"][number]>,
): GameView["text"] {
  if (Array.isArray(wire.replace)) return wire.replace;
  if (!Number.isInteger(wire.length) || (wire.length as number) < 0 || !Array.isArray(wire.set)) {
    throw new Error("Invalid engine text delta");
  }

  const length = wire.length as number;
  const patched = current.slice(0, length);
  patched.length = length;
  for (const change of wire.set) {
    if (
      !Number.isInteger(change.index) ||
      change.index < 0 ||
      change.index >= length ||
      !change.value
    ) {
      throw new Error("Invalid engine text delta entry");
    }
    patched[change.index] = change.value;
  }
  for (let index = 0; index < patched.length; index++) {
    if (patched[index] === undefined) {
      throw new Error("Engine text delta left an undefined entry");
    }
  }
  return patched;
}

function applyEventsDelta(current: string[], wire: EventsDeltaWire): string[] {
  if (Array.isArray(wire.append)) return [...current, ...wire.append];
  if (Array.isArray(wire.replace)) return wire.replace;
  throw new Error("Invalid engine events delta");
}

function applyGameViewDelta(view: GameView, delta: Record<string, unknown>): GameView {
  const normalized = normalizeViewDelta(delta);
  const next = { ...view };

  if ("scenario_title" in normalized)
    next.scenario_title = optionalString(normalized.scenario_title);
  if ("chapter_id" in normalized) next.chapter_id = optionalString(normalized.chapter_id);
  if ("chapter_title" in normalized) next.chapter_title = optionalString(normalized.chapter_title);
  if ("title" in normalized) next.title = optionalString(normalized.title);
  if ("music" in normalized)
    next.music = (normalized.music as GameView["music"] | null) ?? undefined;
  if ("background" in normalized) {
    next.background = (normalized.background as GameView["background"] | null) ?? undefined;
  }
  if ("node_id" in normalized) next.node_id = normalized.node_id as string;
  if ("mode" in normalized) next.mode = normalized.mode as GameView["mode"];
  if ("choices" in normalized) next.choices = normalized.choices as GameView["choices"];
  if ("inventory_items" in normalized) {
    next.inventory_items = normalized.inventory_items as GameView["inventory_items"];
  }
  if ("item_actions" in normalized)
    next.item_actions = normalized.item_actions as GameView["item_actions"];
  if ("characters" in normalized) next.characters = normalized.characters as GameView["characters"];
  if ("player_stats" in normalized)
    next.player_stats = normalized.player_stats as GameView["player_stats"];
  if ("inventory" in normalized) next.inventory = normalized.inventory as GameView["inventory"];
  if ("flags" in normalized) next.flags = normalized.flags as GameView["flags"];
  if ("text" in normalized) {
    next.text = applyTextDelta(
      view.text,
      normalized.text as SparseArrayDeltaWire<GameView["text"][number]>,
    );
  }
  if ("events" in normalized) {
    next.events = applyEventsDelta(view.events, normalized.events as EventsDeltaWire);
  }

  return next;
}

function cacheViewSnapshot(engine: BlackboxEngine, resultJson: string): GameView {
  const snapshot = parseViewSnapshot(parseJson(resultJson));
  engineViews.set(engine, snapshot);
  return snapshot.view;
}

function readAndCacheView(engine: BlackboxEngine): GameView {
  return cacheViewSnapshot(engine, engine.get_current_view());
}

function isViewRevisionMismatch(
  error: EngineError | ViewRevisionMismatchError | undefined,
): error is ViewRevisionMismatchError {
  return error?.type === "viewRevisionMismatch";
}

function commandResultFromDelta(engine: BlackboxEngine, wire: CommandDeltaWire): CommandResult {
  requireProtocol(wire.protocol);
  const revision = requireRevision(wire.revision, "revision");
  const common = {
    ok: wire.ok,
    error: wire.error as EngineError | undefined,
    selected_sfx: wire.selectedSfx,
    triggered_sfx: wire.triggeredSfx,
    rolls: wire.rolls,
    examine: wire.examine,
    chapter_changed: wire.chapterChanged ?? false,
  };

  if (!wire.ok) {
    const cached = engineViews.get(engine);
    if (cached && revision !== cached.revision) {
      throw new Error(
        `Failed engine command changed revision from ${cached.revision} to ${revision}`,
      );
    }
    return common;
  }

  const cached = engineViews.get(engine);
  if (!cached) {
    throw new Error("Engine command delta received before an initial view snapshot");
  }
  const baseRevision = requireRevision(wire.baseRevision, "baseRevision");
  if (baseRevision !== cached.revision) {
    throw new Error(
      `Engine command delta base revision ${baseRevision} does not match cached revision ${cached.revision}`,
    );
  }
  const expectedRevision = (baseRevision + 1) >>> 0;
  if (revision !== expectedRevision) {
    throw new Error(
      `Engine command advanced to revision ${revision}; expected ${expectedRevision}`,
    );
  }

  let view: GameView;
  if (wire.delta && typeof wire.delta === "object") {
    view = applyGameViewDelta(cached.view, wire.delta);
  } else if (wire.snapshot) {
    view = normalizeGameView(wire.snapshot);
  } else {
    throw new Error("Successful engine command omitted both delta and snapshot");
  }

  engineViews.set(engine, { revision, view });
  return { ...common, view };
}

export function readView(engine: BlackboxEngine): GameView {
  try {
    return withEngine(engine, "readView", () => readAndCacheView(engine));
  } catch (error: unknown) {
    throw makeBootError(engineText("errors.readInitialViewFailed"), error);
  }
}

function runDebugViewCommand(
  engine: BlackboxEngine,
  operation: string,
  command: () => string,
): GameView {
  return withEngine(engine, operation, () => cacheViewSnapshot(engine, command()));
}

export async function debugGotoNode(engine: BlackboxEngine, nodeId: string): Promise<GameView> {
  const project = bundleStore.projectInfo;
  if (project) {
    for (const chapter of project.chapters) {
      await ensureChapterLoaded(engine, chapter.id);
    }
  }
  return runDebugViewCommand(engine, "debugGotoNode", () => engine.debugGotoNode(nodeId));
}

export async function debugChangeChapter(
  engine: BlackboxEngine,
  chapterId: string,
  nodeId?: string,
): Promise<GameView> {
  await ensureChapterLoaded(engine, chapterId);
  return runDebugViewCommand(engine, "debugChangeChapter", () =>
    engine.debugChangeChapter(chapterId, nodeId),
  );
}

export function debugAddItem(engine: BlackboxEngine, itemRef: string, count: number): GameView {
  return runDebugViewCommand(engine, "debugAddItem", () => engine.debugAddItem(itemRef, count));
}

export function debugRemoveItem(engine: BlackboxEngine, itemRef: string, count: number): GameView {
  return runDebugViewCommand(engine, "debugRemoveItem", () =>
    engine.debugRemoveItem(itemRef, count),
  );
}

export function debugKillPlayer(engine: BlackboxEngine): GameView {
  return runDebugViewCommand(engine, "debugKillPlayer", () => engine.debugKillPlayer());
}

export function submitCommand(engine: BlackboxEngine, command: PlayerCommand): CommandResult {
  const commandJson = JSON.stringify(command);
  logger.debug("engine", "submit_command", { command });

  return withEngine(engine, "submitCommand", () => {
    const submit = (allowResync: boolean): CommandResult => {
      const cached = engineViews.get(engine);
      if (!cached) {
        readAndCacheView(engine);
      }
      const revision = engineViews.get(engine)?.revision;
      if (revision === undefined) {
        throw new Error("Engine view cache unavailable");
      }

      const wire = parseJson(engine.submit_command(commandJson, revision)) as CommandDeltaWire;
      requireProtocol(wire.protocol);
      if (isViewRevisionMismatch(wire.error)) {
        if (!allowResync) {
          throw new Error(
            `Engine view revision remained stale after resync (expected ${wire.error.expected})`,
          );
        }
        logger.warn("engine", "View revision mismatch; resynchronizing before command retry", {
          expected: wire.error.expected,
          received: wire.error.received,
        });
        readAndCacheView(engine);
        return submit(false);
      }
      return commandResultFromDelta(engine, wire);
    };

    try {
      return submit(true);
    } catch (error: unknown) {
      logger.error("engine", "submit_command failed", {
        command,
        error: toErrorMessage(error),
      });
      throw error;
    }
  });
}

export function serializeEngineState(engine: BlackboxEngine): string {
  return withEngine(engine, "serializeState", () => engine.serialize_state());
}

export function restoreEngineState(engine: BlackboxEngine, stateJson: string): GameView {
  return withEngine(engine, "restoreState", () => {
    return cacheViewSnapshot(engine, engine.restore_state(stateJson));
  });
}

/** True when autosave JSON parses to a non-null object (guards corrupt WASM serialize output). */
export function isValidAutosaveJson(json: string): boolean {
  try {
    const parsed: unknown = JSON.parse(json.trim());
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}

/** Fresh engine instance + autosave restore (use after WASM/runtime failure). */
export async function rebuildEngineFromAutosave(
  bundle: ScenarioBundle,
  autosaveJson: string,
  chapterId?: string | null,
): Promise<BootResult> {
  if (bundle.project) {
    await bundleStore.ensureChapter(chapterId ?? bundle.project.startChapterId);
  }
  const engine = createEngine(bundle);
  const view = restoreEngineState(engine, autosaveJson.trim());
  if (bundle.project && view.chapter_id) {
    await ensureChapterLoaded(engine, view.chapter_id);
  }
  return { engine, bundle, view };
}

export function isWasmRuntimeFailure(error: unknown): boolean {
  if (error instanceof Error && error.name === "RuntimeError") {
    return true;
  }
  const msg = toErrorMessage(error);
  return /memory access out of bounds|unreachable|panicked|crashed/i.test(msg);
}

/** UI offered this choice but the engine rejected it (stale view or desync). */
export function isOfferedChoiceRejected(
  view: GameView,
  command: PlayerCommand,
  result: CommandResult,
): boolean {
  if (result.ok || result.error?.type !== "unknownChoice") {
    return false;
  }
  if (command.type !== "choose") {
    return false;
  }
  return view.choices.some((choice) => choice.id === command.choice_id);
}

export function formatEngineError(error: EngineError): string {
  switch (error.type) {
    case "contentDecodeError":
      return engineText("errors.contentDecodeError", {
        format: error.format,
        message: error.message,
      });
    case "stateEncodeError":
      return engineText("errors.stateEncodeError", {
        format: error.format,
        message: error.message,
      });
    case "stateDecodeError":
      return engineText("errors.stateDecodeError", {
        format: error.format,
        message: error.message,
      });
    case "hostEncodeError":
      return engineText("errors.hostEncodeError", {
        format: error.format,
        message: error.message,
      });
    case "hostDecodeError":
      return engineText("errors.hostDecodeError", {
        format: error.format,
        message: error.message,
      });
    case "unknownNode":
      return engineText("errors.unknownNode", { id: stringField(error, "0") });
    case "unknownChoice":
      return engineText("errors.unknownChoice", { id: stringField(error, "0") });
    case "choiceDisabled":
      return engineText("errors.choiceDisabled", {
        choiceId: error.choiceId,
        reason: error.reason,
      });
    case "expressionError":
      return engineText("errors.expressionError", { detail: stringField(error, "0") });
    case "validationError":
      return engineText("errors.validationError", { detail: stringField(error, "0") });
    case "revisionMismatch":
      return engineText("errors.revisionMismatch", {
        save: error.save,
        current: error.current,
      });
    case "unknownItem":
      return engineText("errors.unknownItem", { id: stringField(error, "0") });
    case "itemNotOwned":
      return engineText("errors.itemNotOwned", { itemRef: error.itemRef });
    case "unknownItemAction":
      return engineText("errors.unknownItemAction", {
        actionId: error.actionId,
        itemRef: error.itemRef,
      });
    case "itemActionDisabled":
      return engineText("errors.itemActionDisabled", {
        actionId: error.actionId,
        itemRef: error.itemRef,
        reason: error.reason,
      });
    case "ambiguousItemAction":
      return engineText("errors.ambiguousItemAction", { itemRef: error.itemRef });
    default: {
      const unknown = error as { type?: string };
      return unknown.type
        ? engineText("errors.engineErrorTyped", { type: unknown.type })
        : engineText("errors.engineError");
    }
  }
}

function stringField(error: EngineError, key: string): string {
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : JSON.stringify(error);
}

export function commandErrorMessage(result: CommandResult, fallback: string): string {
  if (result.error) {
    return formatEngineError(result.error);
  }
  return fallback;
}

function parseJson(json: string): unknown {
  return JSON.parse(json) as unknown;
}
