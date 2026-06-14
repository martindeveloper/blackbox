import { postPreviewMessage } from "@preview-mode";
import {
  PREVIEW_CONSOLE_HISTORY_LIMIT,
  type PreviewConsoleEntry,
  type PreviewConsoleLevel,
} from "@preview-protocol";

const LEVELS: readonly PreviewConsoleLevel[] = ["log", "info", "warn", "error", "debug"];
const MAX_TEXT_LENGTH = 4000;

let nextId = 1;

function serializeArg(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message ? `${value.name}: ${value.message}` : value.name;
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (typeof value === "object") {
    try {
      const seen = new WeakSet<object>();
      const json = JSON.stringify(value, (_key, val) => {
        if (typeof val === "bigint") return `${val}n`;
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) return "[Circular]";
          seen.add(val);
        }
        return val;
      });
      return json ?? String(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

const FORMAT_SPECIFIER = /%[acdfioOjs%]/;

// Apply printf-style console substitutions like the browser does: `%c` consumes a
// CSS style arg and emits nothing (styling is dropped — the editor styles by
// level), `%s/%d/%i/%f/%o/%O/%j` consume and stringify an arg, `%%` is a literal.
// Args not consumed by a specifier are appended, space-separated.
function applyFormat(fmt: string, args: unknown[]): string {
  const regex = /%([acdfioOjs%])/g;
  let out = "";
  let pos = 0;
  let next = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(fmt)) !== null) {
    out += fmt.slice(pos, match.index);
    pos = regex.lastIndex;
    const spec = match[1];
    if (spec === "%") {
      out += "%";
    } else if (spec === "c") {
      next += 1; // consume the style arg, emit nothing
    } else if (next >= args.length) {
      out += match[0]; // no arg to fill — leave the specifier literal
    } else {
      const arg = args[next++];
      if (spec === "s") {
        out += typeof arg === "string" ? arg : serializeArg(arg);
      } else if (spec === "d" || spec === "i") {
        const num = Number(arg);
        out += Number.isNaN(num) ? "NaN" : String(Math.trunc(num));
      } else if (spec === "f") {
        const num = Number(arg);
        out += Number.isNaN(num) ? "NaN" : String(num);
      } else {
        out += serializeArg(arg); // %o %O %j
      }
    }
  }
  out += fmt.slice(pos);
  const remaining = args.slice(next);
  if (remaining.length) out += ` ${remaining.map(serializeArg).join(" ")}`;
  return out;
}

function formatArgs(args: unknown[]): string {
  const first = args[0];
  const text =
    typeof first === "string" && FORMAT_SPECIFIER.test(first)
      ? applyFormat(first, args.slice(1))
      : args.map(serializeArg).join(" ");
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}…` : text;
}

function firstStack(args: unknown[]): string | undefined {
  for (const arg of args) {
    if (arg instanceof Error && arg.stack) return arg.stack;
  }
  return undefined;
}

/**
 * Mirror the preview iframe's console and uncaught errors to the editor host.
 * Keeps a ring buffer so a late-connecting host can replay history via
 * `request-state`. The original console output is preserved.
 */
export function installPreviewConsoleBridge(history: PreviewConsoleEntry[]): void {
  const record = (level: PreviewConsoleLevel, text: string, stack?: string) => {
    const entry: PreviewConsoleEntry = { id: nextId++, at: Date.now(), level, text, stack };
    history.push(entry);
    if (history.length > PREVIEW_CONSOLE_HISTORY_LIMIT) {
      history.splice(0, history.length - PREVIEW_CONSOLE_HISTORY_LIMIT);
    }
    postPreviewMessage({ type: "console-entry", entry });
  };

  for (const level of LEVELS) {
    const original = console[level]?.bind(console);
    console[level] = (...args: unknown[]) => {
      original?.(...args);
      try {
        record(level, formatArgs(args), firstStack(args));
      } catch {
        // Never let mirroring break the game.
      }
    };
  }

  globalThis.addEventListener("error", (event) => {
    const error = event.error;
    const stack = error instanceof Error ? error.stack : undefined;
    record("error", event.message || serializeArg(error), stack);
  });

  globalThis.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : serializeArg(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    record("error", `Unhandled rejection: ${message}`, stack);
  });
}
