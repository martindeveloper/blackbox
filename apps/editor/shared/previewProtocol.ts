export const PREVIEW_MESSAGE_SOURCE = "blackbox-preview" as const;
export const EDITOR_MESSAGE_SOURCE = "blackbox-editor" as const;

export interface PreviewProfilerEvent {
  id: number;
  at: number;
  name: string;
  detail?: string;
  data?: Record<string, unknown>;
}

export type PreviewConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

export interface PreviewConsoleEntry {
  id: number;
  at: number;
  level: PreviewConsoleLevel;
  text: string;
  /** Stack trace for errors / uncaught rejections, when available. */
  stack?: string;
}

export type PreviewSessionPhase = "loading" | "selecting_slot" | "ready" | "error";

export interface PreviewEngineSnapshot {
  current_node_id?: string;
  player?: {
    stats?: Record<string, number>;
  } & Record<string, unknown>;
  inventory?: {
    items?: Record<string, number>;
  } & Record<string, unknown>;
  flags?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PreviewViewSnapshot extends Record<string, unknown> {
  node_id?: string;
  chapter_id?: string;
  chapter_title?: string;
  title?: string;
  location?: string;
  player_stats?: Record<string, number>;
  inventory?: Record<string, number>;
  mode?: string;
}

export type PreviewRuntimeState =
  | { phase: Exclude<PreviewSessionPhase, "ready"> }
  | {
      phase: "ready";
      engine?: PreviewEngineSnapshot;
      view?: Record<string, unknown>;
      lastRolls?: unknown[];
      presentationBaselineStats?: Record<string, number>;
      presentationLocation?: string;
    };

export type PreviewStorageState = Record<string, unknown>;

export const PREVIEW_PROFILER_HISTORY_LIMIT = 200;
export const PREVIEW_CONSOLE_HISTORY_LIMIT = 300;

export type PreviewHostCommand =
  | { type: "toggle-console" }
  | { type: "request-state" }
  | { type: "clear-profiler" }
  | { type: "clear-console" }
  | { type: "clear-saves" }
  | { type: "clear-all" }
  | { type: "load-storage"; state: Record<string, unknown> };

export type PreviewPlayerNotification =
  | { type: "ready" }
  | { type: "runtime-state"; state: PreviewRuntimeState }
  | { type: "storage-state"; state: PreviewStorageState }
  | { type: "storage-cleared"; scope: "saves" | "all" }
  | { type: "storage-load-result"; ok: boolean; message: string }
  | { type: "profiler-event"; event: PreviewProfilerEvent }
  | { type: "profiler-history"; events: PreviewProfilerEvent[] }
  | { type: "console-entry"; entry: PreviewConsoleEntry }
  | { type: "console-history"; entries: PreviewConsoleEntry[] };

export function postPreviewHostMessage(
  target: Window,
  command: PreviewHostCommand,
  origin: string = location.origin,
): void {
  target.postMessage({ source: EDITOR_MESSAGE_SOURCE, ...command }, origin);
}

function isPreviewRuntimeState(value: unknown): value is PreviewRuntimeState {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  switch (record.phase) {
    case "loading":
    case "selecting_slot":
    case "ready":
    case "error":
      return true;
    default:
      return false;
  }
}

export type PreviewHostMessage =
  | { source: typeof EDITOR_MESSAGE_SOURCE; type: "toggle-console" }
  | { source: typeof EDITOR_MESSAGE_SOURCE; type: "request-state" }
  | { source: typeof EDITOR_MESSAGE_SOURCE; type: "clear-profiler" }
  | { source: typeof EDITOR_MESSAGE_SOURCE; type: "clear-console" }
  | { source: typeof EDITOR_MESSAGE_SOURCE; type: "clear-saves" }
  | { source: typeof EDITOR_MESSAGE_SOURCE; type: "clear-all" }
  | {
      source: typeof EDITOR_MESSAGE_SOURCE;
      type: "load-storage";
      state: Record<string, unknown>;
    };

export type PreviewPlayerMessage =
  | { source: typeof PREVIEW_MESSAGE_SOURCE; type: "ready" }
  | { source: typeof PREVIEW_MESSAGE_SOURCE; type: "runtime-state"; state: PreviewRuntimeState }
  | { source: typeof PREVIEW_MESSAGE_SOURCE; type: "storage-state"; state: PreviewStorageState }
  | {
      source: typeof PREVIEW_MESSAGE_SOURCE;
      type: "storage-cleared";
      scope: "saves" | "all";
    }
  | {
      source: typeof PREVIEW_MESSAGE_SOURCE;
      type: "storage-load-result";
      ok: boolean;
      message: string;
    }
  | {
      source: typeof PREVIEW_MESSAGE_SOURCE;
      type: "profiler-event";
      event: PreviewProfilerEvent;
    }
  | {
      source: typeof PREVIEW_MESSAGE_SOURCE;
      type: "profiler-history";
      events: PreviewProfilerEvent[];
    }
  | {
      source: typeof PREVIEW_MESSAGE_SOURCE;
      type: "console-entry";
      entry: PreviewConsoleEntry;
    }
  | {
      source: typeof PREVIEW_MESSAGE_SOURCE;
      type: "console-history";
      entries: PreviewConsoleEntry[];
    };

function hasPreviewSource(
  value: object,
  source: string,
): value is { source: string; type: string } & Record<string, unknown> {
  return (
    "source" in value &&
    value.source === source &&
    "type" in value &&
    typeof value.type === "string"
  );
}

export function isPreviewHostMessage(data: unknown): data is PreviewHostMessage {
  if (typeof data !== "object" || data === null || !hasPreviewSource(data, EDITOR_MESSAGE_SOURCE)) {
    return false;
  }
  switch (data.type) {
    case "toggle-console":
    case "request-state":
    case "clear-profiler":
    case "clear-console":
    case "clear-saves":
    case "clear-all":
      return true;
    case "load-storage":
      return (
        "state" in data &&
        data.state !== null &&
        typeof data.state === "object" &&
        !Array.isArray(data.state)
      );
    default:
      return false;
  }
}

export function isPreviewPlayerMessage(data: unknown): data is PreviewPlayerMessage {
  if (
    typeof data !== "object" ||
    data === null ||
    !hasPreviewSource(data, PREVIEW_MESSAGE_SOURCE)
  ) {
    return false;
  }
  switch (data.type) {
    case "ready":
      return true;
    case "runtime-state":
      return "state" in data && isPreviewRuntimeState(data.state);
    case "storage-state":
      return (
        "state" in data &&
        data.state !== null &&
        typeof data.state === "object" &&
        !Array.isArray(data.state)
      );
    case "storage-cleared":
      return data.scope === "saves" || data.scope === "all";
    case "storage-load-result":
      return typeof data.message === "string" && typeof data.ok === "boolean";
    case "profiler-event":
      return typeof data.event === "object" && data.event !== null;
    case "profiler-history":
      return Array.isArray(data.events);
    case "console-entry":
      return typeof data.entry === "object" && data.entry !== null;
    case "console-history":
      return Array.isArray(data.entries);
    default:
      return false;
  }
}

export const PREVIEW_STORAGE_EXPORT_FORMAT = "blackbox-preview-storage" as const;
