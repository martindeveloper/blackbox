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
          <a className="editor-showcase-link" href="/editor">
            Explore every editor feature
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
        </div>

        <div className="editor-canvas">
          <div className="editor-canvas-head">
            <span>BLACKBOX / EDITOR</span>
            <span className="editor-canvas-status">
              <i aria-hidden="true" />
              WORKSPACE ONLINE
            </span>
          </div>

          <figure className="editor-primary">
            <img src={graph.src} alt={graph.alt} draggable={false} loading="lazy" />
            <figcaption>
              <span className="editor-primary-kicker">01 / STORY MAP</span>
              <strong>{graph.label}</strong>
              <p>{graph.caption}</p>
            </figcaption>
          </figure>

          <div className="editor-supporting-head" aria-hidden="true">
            <span>SUPPORTING VIEWS</span>
            <i />
            <span>03 / 04</span>
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
