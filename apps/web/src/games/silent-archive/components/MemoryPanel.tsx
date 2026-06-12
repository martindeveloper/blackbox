import { useTranslation } from "react-i18next";
import { formatRefId } from "../../../engine/lib/format.js";
import type { MetaCatalog } from "../../../engine/types/game.js";

interface MemoryPanelProps {
  memories: string[];
  meta: MetaCatalog;
}

export function MemoryPanel({ memories, meta }: MemoryPanelProps) {
  const { t } = useTranslation();

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
          <article key={flagId} className="memory-card">
            <div className="memory-card-index">{String(index + 1).padStart(2, "0")}</div>
            <div className="memory-card-body">
              <h3>{title}</h3>
              {description && <p className="memory-card-detail">{description}</p>}
              <div className="memory-card-signal">
                <span />
                <span />
                <span />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
