import { useEffect, useRef, useState } from "react";
import {
  devConsoleHelp,
  parseDevConsoleCommand,
  type DevConsoleResult,
} from "../lib/devConsole.js";

interface ConsoleLine {
  id: number;
  kind: "command" | "success" | "error" | "info";
  text: string;
}

interface DevConsoleProps {
  enabled: boolean;
  onExecute: (command: ReturnType<typeof parseDevConsoleCommand>) => Promise<DevConsoleResult>;
}

export function DevConsole({ enabled, onExecute }: DevConsoleProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [lines, setLines] = useState<ConsoleLine[]>([
    { id: 0, kind: "info", text: "Blackbox runtime console ready. Type help for commands." },
  ]);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.code !== "Backquote" || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen((value) => !value);
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [enabled]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines, open]);

  if (!enabled || !open) return null;

  const append = (kind: ConsoleLine["kind"], text: string) => {
    nextId.current += 1;
    setLines((current) => [...current.slice(-80), { id: nextId.current, kind, text }]);
  };

  const submit = async () => {
    const raw = input.trim();
    if (!raw || pending) return;
    append("command", raw);
    setHistory((current) => [...current.filter((entry) => entry !== raw), raw].slice(-30));
    setHistoryIndex(-1);
    setInput("");

    let command: ReturnType<typeof parseDevConsoleCommand>;
    try {
      command = parseDevConsoleCommand(raw);
    } catch (error) {
      append("error", error instanceof Error ? error.message : String(error));
      return;
    }

    if (command.type === "clear") {
      setLines([]);
      return;
    }
    if (command.type === "help") {
      for (const entry of devConsoleHelp()) append("info", entry);
      return;
    }

    setPending(true);
    try {
      const result = await onExecute(command);
      append(result.ok ? "success" : "error", result.message);
    } catch (error) {
      append("error", error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <section className="dev-console" role="dialog" aria-label="Developer console">
      <div className="dev-console__scan" aria-hidden />
      <header className="dev-console__header">
        <span>BLACKBOX.RUNTIME</span>
        <span className="dev-console__mode">DEVELOPMENT AUTHORITY</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close developer console">
          [~]
        </button>
      </header>
      <div ref={logRef} className="dev-console__log" aria-live="polite">
        {lines.map((line) => (
          <div key={line.id} className={`dev-console__line dev-console__line--${line.kind}`}>
            <span>{line.kind === "command" ? ">" : line.kind === "error" ? "!" : "::"}</span>
            <p>{line.text}</p>
          </div>
        ))}
      </div>
      <form
        className="dev-console__prompt"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <span>Cmd:</span>
        <input
          ref={inputRef}
          value={input}
          disabled={pending}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              const next = Math.min(history.length - 1, historyIndex + 1);
              setHistoryIndex(next);
              setInput(next >= 0 ? (history[history.length - 1 - next] ?? "") : "");
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              const next = historyIndex - 1;
              setHistoryIndex(next);
              setInput(next >= 0 ? (history[history.length - 1 - next] ?? "") : "");
            }
          }}
          aria-label="Developer console command"
        />
        <span
          className={pending ? "dev-console__busy dev-console__busy--active" : "dev-console__busy"}
        >
          EXEC
        </span>
      </form>
    </section>
  );
}
