import Link from "next/link";
import { useTranslation } from "react-i18next";

type Tab = {
  id: string;
  label: string;
  caption: string;
  src: string;
  alt: string;
};

export function EditorShowcase() {
  const { t } = useTranslation();
  const tabs = t("editor.tabs", { returnObjects: true }) as Tab[];
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const graph = byId.get("graph");
  const supporting = ["simulator", "items", "project"]
    .map((id) => byId.get(id))
    .filter((tab): tab is Tab => Boolean(tab));

  if (!graph) return null;

  return (
    <section className="editor-showcase section" id="editor">
      <div className="container">
        <div className="editor-header">
          <div className="editor-header-copy">
            <span className="section-label">{t("editor.label")}</span>
            <h2 className="section-headline">
              {t("editor.headline")
                .split("\n")
                .map((line, i) => (
                  <span key={i}>
                    {line}
                    {i === 0 && <br />}
                  </span>
                ))}
            </h2>
          </div>
          <p className="editor-body">{t("editor.body")}</p>
        </div>

        <div className="editor-showcase-link-row">
          <Link className="editor-showcase-link" href="/editor">
            <span className="editor-showcase-link-copy">
              <span className="editor-showcase-link-kicker">
                {t("editor.showcase.tour_link.kicker")}
              </span>
              <strong>{t("editor.showcase.tour_link.title")}</strong>
            </span>
            <span className="editor-showcase-link-action" aria-hidden="true">
              <i>
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </i>
            </span>
          </Link>
        </div>

        <div className="editor-canvas">
          <div className="editor-canvas-head">
            <span>{t("editor.showcase.canvas.header")}</span>
            <span className="editor-canvas-status">
              <i aria-hidden="true" />
              {t("editor.showcase.canvas.status")}
            </span>
          </div>

          <figure className="editor-primary">
            <img src={graph.src} alt={graph.alt} draggable={false} loading="lazy" />
            <figcaption>
              <span className="editor-primary-kicker">{t("editor.showcase.primary_kicker")}</span>
              <strong>{graph.label}</strong>
              <p>{graph.caption}</p>
            </figcaption>
          </figure>

          <div className="editor-supporting-head" aria-hidden="true">
            <span>{t("editor.showcase.supporting_heading")}</span>
            <i />
            <span>
              {t("editor.showcase.supporting_count", {
                current: String(supporting.length + 1).padStart(2, "0"),
                total: String(tabs.length).padStart(2, "0"),
              })}
            </span>
          </div>

          <div className="editor-contact-sheet">
            {supporting.map((tab, index) => (
              <figure className={`editor-contact editor-contact--${tab.id}`} key={tab.id}>
                <div className="editor-contact-shot">
                  <img src={tab.src} alt={tab.alt} draggable={false} loading="lazy" />
                </div>
                <figcaption>
                  <span>0{index + 2}</span>
                  <strong>{tab.label}</strong>
                  <p>{tab.caption}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
