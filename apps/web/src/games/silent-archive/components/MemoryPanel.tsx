import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatRefId } from "../../../engine/lib/format.js";
import type { MetaCatalog } from "../../../engine/types/game.js";

interface MemoryPanelProps {
  memories: string[];
  meta: MetaCatalog;
  initialIntelRef?: string;
}

export function MemoryPanel({ memories, meta, initialIntelRef }: MemoryPanelProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!initialIntelRef) return;
    const target = document.querySelector<HTMLElement>(
      `[data-intel-ref="${CSS.escape(initialIntelRef)}"]`,
    );
    target?.scrollIntoView({ block: "nearest" });
    target?.focus({ preventScroll: true });
  }, [initialIntelRef]);

  if (!memories.length) {
    return (
      <div className="memory-empty">
        <span className="memory-empty-mark" aria-hidden />
        <p>{t("memory.empty")}</p>
      </div>
    );
  }

  return (
    <div className="memory-grid">
      {memories.map((flagId, index) => {
        const entry = meta.flags[flagId];
        const title = entry?.title ?? formatRefId(flagId);
        const description = entry?.description;
        return (
          <article
            key={flagId}
            className={`memory-card${flagId === initialIntelRef ? " memory-card--focused" : ""}`}
            data-intel-ref={flagId}
            tabIndex={flagId === initialIntelRef ? -1 : undefined}
          >
            <div className="memory-card-index">{String(index + 1).padStart(2, "0")}</div>
            <div className="memory-card-body">
              <h3>{title}</h3>
              {description && <p className="memory-card-detail">{description}</p>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
