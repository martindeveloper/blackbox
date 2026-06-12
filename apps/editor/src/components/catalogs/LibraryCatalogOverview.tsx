import { BookCopy, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { Button } from "../ui/Button.js";

export function LibraryCatalogOverview() {
  const { t } = useTranslation();
  const bundle = useScenarioStore((s) => s.bundle);
  const createLibrary = useScenarioStore((s) => s.createLibrary);

  if (!bundle) return null;

  if (!bundle.library) {
    return (
      <div className="library-overview-no-library">
        <BookCopy size={28} strokeWidth={1.5} />
        <p>{t("library.noLibrary")}</p>
        <Button size="sm" leadingIcon={Plus} className="mt-3" onClick={() => createLibrary()}>
          {t("scenario.createLibrary")}
        </Button>
      </div>
    );
  }

  const snippetCount = Object.keys(bundle.library.snippets).length;
  const templateCount = Object.keys(bundle.library.templates).length;
  const conditionCount = Object.keys(bundle.library.conditions ?? {}).length;

  return (
    <div className="library-overview">
      <div className="library-overview-header">
        <div className="library-overview-icon">
          <BookCopy size={18} strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="library-overview-title">{t("library.overviewTitle")}</h1>
          <p className="library-overview-subtitle">{t("library.overviewSubtitle")}</p>
        </div>
      </div>

      <div className="library-stat-grid">
        <div className="library-stat-card library-stat-card--snippet">
          <div className="library-stat-card-top">
            <span className="library-stat-count">{snippetCount}</span>
            <span className="library-stat-icon">@</span>
          </div>
          <span className="library-stat-label">{t("library.snippetsSection")}</span>
        </div>
        <div className="library-stat-card library-stat-card--template">
          <div className="library-stat-card-top">
            <span className="library-stat-count">{templateCount}</span>
            <span className="library-stat-icon">$</span>
          </div>
          <span className="library-stat-label">{t("library.templatesSection")}</span>
        </div>
        <div className="library-stat-card library-stat-card--condition">
          <div className="library-stat-card-top">
            <span className="library-stat-count">{conditionCount}</span>
            <span className="library-stat-icon">?</span>
          </div>
          <span className="library-stat-label">{t("library.conditionsSection")}</span>
        </div>
      </div>
    </div>
  );
}
