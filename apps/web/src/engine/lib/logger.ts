import { setWasmLogLevel } from "./wasmHost.js";
import { captureClientLog } from "./supportLog.js";
import { readPlayerStorage, writePlayerStorage } from "./playerConfig.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let _minLevel: LogLevel = "info";
let _wasmReady = false;

function readStoredLevel(): LogLevel {
  const stored = readPlayerStorage("log-level", "blackbox_log_level");
  if (stored === "debug" || stored === "info" || stored === "warn" || stored === "error") {
    return stored;
  }
  return "info";
}

function persistLevel(level: LogLevel): void {
  writePlayerStorage("log-level", level);
}

function syncWasmLevel(level: LogLevel): void {
  if (!_wasmReady) return;
  try {
    setWasmLogLevel(level);
  } catch (error) {
    console.warn("[logger] failed to sync wasm log level", error);
  }
}

export function markWasmLoggingReady(): void {
  _wasmReady = true;
  syncWasmLevel(_minLevel);
}

export function initializePlayerLogger(): void {
  _minLevel = readStoredLevel();
  syncWasmLevel(_minLevel);
}

export function getLogLevel(): LogLevel {
  return _minLevel;
}

export function setLogLevel(level: LogLevel): void {
  const previous = _minLevel;
  _minLevel = level;
  persistLevel(level);
  syncWasmLevel(level);
  if (previous !== level) {
    emitAlways("info", "logger", `Client log level changed: ${previous} -> ${level}`, {
      previous,
      current: level,
    });
  }
}

const STYLES: Record<LogLevel, string> = {
  debug: "color:#8a7050;font-weight:normal",
  info: "color:#ff6d1a;font-weight:normal",
  warn: "color:#e0aa18;font-weight:bold",
  error: "color:#e82020;font-weight:bold",
};

function shouldEmit(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[_minLevel];
}

export function writePlainLogToConsole(level: LogLevel, message: string): void {
  if (!shouldEmit(level)) return;
  if (level === "debug") console.log(message);
  else if (level === "info") console.info(message);
  else if (level === "warn") console.warn(message);
  else console.error(message);
}

function emit(level: LogLevel, category: string, message: string, data?: unknown): void {
  if (!shouldEmit(level)) return;
  emitAlways(level, category, message, data);
}

function emitAlways(level: LogLevel, category: string, message: string, data?: unknown): void {
  captureClientLog(level, category, message, data);
  const ts = new Date().toISOString().slice(11, 23);
  const tag = `%c${ts} [${category}]`;
  const args: unknown[] = [tag, STYLES[level], message];
  if (data !== undefined) args.push(data);

  // Use console.log for debug — console.debug is hidden unless DevTools level is Verbose.
  if (level === "debug") console.log(...args);
  else if (level === "info") console.info(...args);
  else if (level === "warn") console.warn(...args);
  else console.error(...args);
}

export const logger = {
  debug: (category: string, message: string, data?: unknown) =>
    emit("debug", category, message, data),
  info: (category: string, message: string, data?: unknown) =>
    emit("info", category, message, data),
  warn: (category: string, message: string, data?: unknown) =>
    emit("warn", category, message, data),
  error: (category: string, message: string, data?: unknown) =>
    emit("error", category, message, data),
};
