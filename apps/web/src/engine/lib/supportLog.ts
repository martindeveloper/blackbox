import { type LogLevel, writePlainLogToConsole } from "./logger.js";

export const MAX_LOG_ENTRIES = 10_000;

export interface SupportLogEntry {
  timestamp: string;
  level: LogLevel;
  category?: string;
  message: string;
  data?: unknown;
}

const clientEntries: SupportLogEntry[] = [];
const engineEntries: SupportLogEntry[] = [];

function append(entries: SupportLogEntry[], entry: SupportLogEntry): void {
  entries.push(entry);
  while (entries.length > MAX_LOG_ENTRIES) {
    entries.shift();
  }
}

export function captureClientLog(
  level: LogLevel,
  category: string,
  message: string,
  data?: unknown,
): void {
  append(clientEntries, {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    ...(data === undefined ? {} : { data: normalizeLogData(data) }),
  });
}

function captureEngineLog(level: LogLevel, message: string): void {
  append(engineEntries, {
    timestamp: new Date().toISOString(),
    level,
    message,
  });

  writePlainLogToConsole(level, message);
}

export function getClientLogEntries(): readonly SupportLogEntry[] {
  return clientEntries;
}

export function getEngineLogEntries(): readonly SupportLogEntry[] {
  return engineEntries;
}

function normalizeLogData(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: value.cause === undefined ? undefined : normalizeLogData(value.cause, seen),
    };
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => normalizeLogData(item, seen));

  const normalized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    normalized[key] = normalizeLogData(item, seen);
  }
  return normalized;
}

declare global {
  var __blackboxCaptureEngineLog: ((level: LogLevel, formatted: string) => void) | undefined;
}

globalThis.__blackboxCaptureEngineLog = captureEngineLog;
