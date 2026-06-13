import { useTranslation } from "react-i18next";
import type { MetaCatalog } from "../../../engine/types/game.js";

interface JournalPanelProps {
  events: string[];
  meta: MetaCatalog;
}

export function JournalPanel({ events, meta }: JournalPanelProps) {
  const { t } = useTranslation();

  if (!events.length) {
    return (
      <div className="journal-empty">
        <span className="journal-empty-mark" aria-hidden />
        <p>{t("journal.empty")}</p>
      </div>
    );
  }

  const newestEvents = [...events].reverse();

  return (
    <div className="journal-modal-content">
      <div className="journal-ledger">
        <span className="journal-ledger-kicker">{t("journal.ledgerKicker")}</span>
        <span className="journal-ledger-count">
          {events.length}{" "}
          {events.length === 1 ? t("journal.entrySingular") : t("journal.entryPlural")}
        </span>
      </div>

      <ol className="journal-timeline" aria-label={t("journal.title")}>
        {newestEvents.map((eventId, index) => {
          const entry = meta.events[eventId];
          const title = entry?.title ?? eventId;
          const description = entry?.description;
          const entryNumber = events.length - index;
          return (
            <li
              key={`${index}-${eventId}`}
              className="journal-entry"
              style={{ animationDelay: `${0.06 + index * 0.05}s` }}
            >
              <div className="journal-entry-rail" aria-hidden>
                <span className="journal-entry-node" />
                {index < newestEvents.length - 1 && <span className="journal-entry-line" />}
              </div>
              <div className="journal-entry-body">
                <div className="journal-entry-head">
                  <span className="journal-entry-index">
                    {t("journal.entryPrefix")} {String(entryNumber).padStart(2, "0")}
                  </span>
                  <span className="journal-entry-stamp">{t("journal.stamped")}</span>
                </div>
                <p className="journal-entry-text">{title}</p>
                {description && <p className="journal-entry-detail">{description}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
