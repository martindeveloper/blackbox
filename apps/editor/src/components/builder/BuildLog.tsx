import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Download, Loader2 } from "lucide-react";
import { Icon } from "@/components/icons/Icon.js";
import { Input } from "@/components/ui/Input.js";

interface Props {
  log: string[];
  running: boolean;
  projectName?: string | null;
}

function safeDownloadName(projectName: string | null | undefined): string {
  const base = (projectName?.trim() || "build").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return base || "build";
}

function highlightLine(line: string, query: string, lineKey: number): ReactNode {
  const needle = query.trim();
  if (!needle) return line;

  const lowerLine = line.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let start = 0;
  let matchAt = lowerLine.indexOf(lowerNeedle, start);
  let partKey = 0;

  while (matchAt !== -1) {
    if (matchAt > start) {
      parts.push(
        <Fragment key={`t-${lineKey}-${partKey++}`}>{line.slice(start, matchAt)}</Fragment>,
      );
    }
    parts.push(
      <mark key={`m-${lineKey}-${partKey++}`} className="build-log-mark">
        {line.slice(matchAt, matchAt + needle.length)}
      </mark>,
    );
    start = matchAt + needle.length;
    matchAt = lowerLine.indexOf(lowerNeedle, start);
  }

  if (start < line.length) {
    parts.push(<Fragment key={`t-${lineKey}-${partKey++}`}>{line.slice(start)}</Fragment>);
  }

  return parts.length > 0 ? parts : line;
}

export function BuildLog({ log, running, projectName }: Props) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const fullText = useMemo(() => log.join("\n"), [log]);
  const filteredLines = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return log;
    return log.filter((line) => line.toLowerCase().includes(needle));
  }, [log, query]);
  const displayText = useMemo(() => filteredLines.join("\n"), [filteredLines]);
  const hasFilter = query.trim().length > 0;
  const canExport = log.length > 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight;
  }, [log, displayText]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const onCopy = async () => {
    if (!canExport) return;
    try {
      await navigator.clipboard.writeText(displayText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const onDownload = () => {
    if (!canExport) return;
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.download = `${safeDownloadName(projectName)}-${stamp}.log`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const emptyMessage =
    log.length === 0
      ? running
        ? t("build.waiting")
        : t("build.logEmpty")
      : t("build.logFilterEmpty");

  return (
    <section className="build-output-shell" aria-live="polite">
      <div className="build-log-header">
        <span className="build-log-label">{t("build.log")}</span>
        <Input
          compact
          mono
          type="search"
          className="build-log-search"
          value={query}
          placeholder={t("build.logFilterPlaceholder")}
          aria-label={t("build.logFilterPlaceholder")}
          disabled={!canExport}
          onChange={(event) => setQuery(event.target.value)}
        />
        {log.length > 0 ? (
          <span className="build-log-count">
            {hasFilter
              ? t("build.logLinesFiltered", { count: filteredLines.length, total: log.length })
              : t("build.logLines", { count: log.length })}
          </span>
        ) : null}
        <div className="build-log-actions">
          <button
            type="button"
            className="build-log-action"
            disabled={!canExport}
            title={copied ? t("build.logCopied") : t("build.logCopy")}
            aria-label={copied ? t("build.logCopied") : t("build.logCopy")}
            onClick={() => void onCopy()}
          >
            <Icon icon={copied ? Check : Copy} size={12} />
          </button>
          <button
            type="button"
            className="build-log-action"
            disabled={!canExport}
            title={t("build.logDownload")}
            aria-label={t("build.logDownload")}
            onClick={onDownload}
          >
            <Icon icon={Download} size={12} />
          </button>
        </div>
      </div>
      <div className="build-log-body" ref={scrollRef} onScroll={onScroll}>
        {log.length === 0 || (hasFilter && filteredLines.length === 0) ? (
          <div className="build-log-empty">
            {log.length === 0 && running ? (
              <Icon icon={Loader2} size={14} className="build-spin" />
            ) : null}
            {emptyMessage}
          </div>
        ) : (
          <pre className="build-log-pre">
            {filteredLines.map((line, index) => (
              <span key={index} className="build-log-line">
                {highlightLine(line, query, index)}
              </span>
            ))}
          </pre>
        )}
      </div>
    </section>
  );
}
