import { useMemo, useState } from "react";
import { ChevronRight, Terminal, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePreviewStore, type PreviewConsoleEntry } from "../../store/usePreviewStore.js";
import { Icon } from "../icons/Icon.js";
import { Input } from "../ui/Input.js";

type ConsoleFilter = "all" | "log" | "warn" | "error";

const CONSOLE_FILTERS: readonly ConsoleFilter[] = ["all", "log", "warn", "error"];

function matchesFilter(entry: PreviewConsoleEntry, filter: ConsoleFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "error":
      return entry.level === "error";
    case "warn":
      return entry.level === "warn";
    case "log":
      return entry.level === "log" || entry.level === "info" || entry.level === "debug";
  }
}

function matchesQuery(entry: PreviewConsoleEntry, query: string): boolean {
  const norm = query.trim().toLowerCase();
  if (!norm) return true;
  return (
    entry.text.toLowerCase().includes(norm) || (entry.stack?.toLowerCase().includes(norm) ?? false)
  );
}

function formatTime(at: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString(undefined, { hour12: false });
  return `${time}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

export function PreviewInspectorConsole() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ConsoleFilter>("all");
  const [query, setQuery] = useState("");
  const entries = usePreviewStore((state) => state.consoleEntries);
  const commandSender = usePreviewStore((state) => state.commandSender);

  const filtered = useMemo(
    () => entries.filter((entry) => matchesFilter(entry, filter) && matchesQuery(entry, query)),
    [entries, filter, query],
  );
  const errorCount = useMemo(
    () => entries.reduce((total, entry) => total + (entry.level === "error" ? 1 : 0), 0),
    [entries],
  );
  const warnCount = useMemo(
    () => entries.reduce((total, entry) => total + (entry.level === "warn" ? 1 : 0), 0),
    [entries],
  );
  const emptyMessage =
    entries.length > 0 ? t("preview.consoleFilterEmpty") : t("preview.noConsoleEntries");

  return (
    <details className="preview-console">
      <summary className="preview-console-summary">
        <span className="preview-console-summary-label">
          <Icon icon={ChevronRight} size={12} />
          <Icon icon={Terminal} size={13} />
          {t("preview.console")}
        </span>
        <span className="preview-console-summary-counts">
          {errorCount > 0 && (
            <em className="preview-console-badge preview-console-badge--error">{errorCount}</em>
          )}
          {warnCount > 0 && (
            <em className="preview-console-badge preview-console-badge--warn">{warnCount}</em>
          )}
          <em className="preview-console-count">{entries.length}</em>
        </span>
      </summary>

      <div className="preview-console-body">
        <div className="preview-console-toolbar">
          <div className="preview-console-filters">
            {CONSOLE_FILTERS.map((candidate) => (
              <button
                key={candidate}
                type="button"
                className={candidate === filter ? "is-active" : undefined}
                onClick={() => setFilter(candidate)}
              >
                {t(`preview.consoleFilter.${candidate}`)}
              </button>
            ))}
          </div>
          <Input
            compact
            mono
            type="search"
            value={query}
            placeholder={t("preview.consoleFilterPlaceholder")}
            aria-label={t("preview.consoleFilterPlaceholder")}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            className="preview-console-clear"
            disabled={!entries.length}
            title={t("preview.clearConsole")}
            onClick={() => commandSender?.({ type: "clear-console" })}
          >
            <Icon icon={Trash2} size={12} />
          </button>
        </div>
        <div className="preview-console-log" role="log">
          {filtered.length ? (
            filtered.map((entry) => (
              <article key={entry.id} className={`preview-console-entry is-${entry.level}`}>
                <time>{formatTime(entry.at)}</time>
                <div className="preview-console-entry-body">
                  <pre className="preview-console-text">{entry.text}</pre>
                  {entry.stack && (
                    <details className="preview-console-stack">
                      <summary>{t("preview.consoleStack")}</summary>
                      <pre>{entry.stack}</pre>
                    </details>
                  )}
                </div>
              </article>
            ))
          ) : (
            <div className="preview-console-empty">{emptyMessage}</div>
          )}
        </div>
      </div>
    </details>
  );
}
