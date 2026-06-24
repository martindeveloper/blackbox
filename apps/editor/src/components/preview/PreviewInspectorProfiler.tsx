import { useMemo, useState } from "react";
import { Activity, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePreviewStore, type PreviewProfilerEvent } from "@/store/usePreviewStore.js";
import { Icon } from "@/components/icons/Icon.js";
import { Input } from "@/components/ui/Input.js";
import { displayValue, SectionTitle } from "./previewInspectorUtils.js";

type ProfilerFilter = "all" | "audio" | "io" | "session" | "scenario";

const PROFILER_FILTERS: readonly ProfilerFilter[] = ["all", "audio", "io", "session", "scenario"];

function profilerEventMatchesQuery(event: PreviewProfilerEvent, query: string): boolean {
  const norm = query.trim().toLowerCase();
  if (!norm) return true;
  if (event.name.toLowerCase().includes(norm)) return true;
  if (event.detail?.toLowerCase().includes(norm)) return true;
  if (!event.data) return false;
  return Object.entries(event.data).some(
    ([key, value]) =>
      key.toLowerCase().includes(norm) || String(value).toLowerCase().includes(norm),
  );
}

export function PreviewInspectorProfiler({
  dock = false,
  showHeader = true,
}: {
  dock?: boolean;
  showHeader?: boolean;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ProfilerFilter>("all");
  const [query, setQuery] = useState("");
  const events = usePreviewStore((state) => state.profilerEvents);
  const commandSender = usePreviewStore((state) => state.commandSender);
  const clearProfilerEvents = usePreviewStore((state) => state.clearProfilerEvents);
  const handleClearProfiler = () => {
    clearProfilerEvents();
    commandSender?.({ type: "clear-profiler" });
  };
  const categoryEvents = useMemo(
    () =>
      filter === "all" ? events : events.filter((event) => event.name.startsWith(`${filter}.`)),
    [events, filter],
  );
  const filtered = useMemo(
    () => categoryEvents.filter((event) => profilerEventMatchesQuery(event, query)),
    [categoryEvents, query],
  );
  const newestFirst = useMemo(
    () => [...filtered].sort((a, b) => b.at - a.at || b.id - a.id),
    [filtered],
  );
  const emptyMessage =
    categoryEvents.length > 0 && query.trim()
      ? t("preview.profilerFilterEmpty")
      : t("preview.noProfilerEvents");

  return (
    <section
      className={
        dock ? "preview-inspector-section preview-profiler--dock" : "preview-inspector-section"
      }
    >
      {showHeader ? (
        <div className="preview-inspector-title-row">
          <SectionTitle icon={Activity} title={t("preview.profiler")} count={filtered.length} />
          <button
            type="button"
            className="preview-profiler-clear"
            disabled={!events.length}
            title={t("preview.clearProfiler")}
            onClick={handleClearProfiler}
          >
            <Icon icon={Trash2} size={11} />
          </button>
        </div>
      ) : null}
      <div className="preview-profiler-card">
        <div className="preview-profiler-filters">
          {PROFILER_FILTERS.map((category) => (
            <button
              key={category}
              type="button"
              className={filter === category ? "is-active" : undefined}
              onClick={() => setFilter(category)}
            >
              {t(`preview.profilerFilter.${category}`)}
            </button>
          ))}
        </div>
        <div className="preview-profiler-query">
          <Input
            compact
            mono
            type="search"
            value={query}
            placeholder={t("preview.profilerFilterPlaceholder")}
            aria-label={t("preview.profilerFilterPlaceholder")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="preview-profiler-list">
          {filtered.length ? (
            newestFirst.map((event) => {
              const category = event.name.split(".")[0] ?? "event";
              return (
                <article key={event.id} className={`preview-profiler-event is-${category}`}>
                  <time>{new Date(event.at).toLocaleTimeString()}</time>
                  <div>
                    <strong>{event.name}</strong>
                    {event.detail && <span title={event.detail}>{event.detail}</span>}
                    {event.data && Object.keys(event.data).length > 0 && (
                      <code title={JSON.stringify(event.data)}>
                        {Object.entries(event.data)
                          .slice(0, 3)
                          .map(([key, value]) => `${key}=${displayValue(value)}`)
                          .join(" · ")}
                      </code>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="preview-profiler-empty">{emptyMessage}</div>
          )}
        </div>
      </div>
    </section>
  );
}
