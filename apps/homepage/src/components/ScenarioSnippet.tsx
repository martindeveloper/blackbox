import { useTranslation } from "react-i18next";
import { useClientOS } from "@/hooks/useClientOS";
import { highlightJson } from "@/lib/jsonHighlight";

function MacWindowChrome({ filename }: { filename: string }) {
  return (
    <>
      <span className="snippet-dot" />
      <span className="snippet-dot" />
      <span className="snippet-dot" />
      <span className="snippet-filename">{filename}</span>
    </>
  );
}

function WindowsWindowChrome({ filename }: { filename: string }) {
  return (
    <>
      <span className="snippet-filename">{filename}</span>
      <div className="snippet-win-controls" aria-hidden="true">
        <span className="snippet-win-btn snippet-win-btn--min" />
        <span className="snippet-win-btn snippet-win-btn--max" />
        <span className="snippet-win-btn snippet-win-btn--close" />
      </div>
    </>
  );
}

export function ScenarioSnippet() {
  const { t } = useTranslation();
  const os = useClientOS();
  const isWindows = os === "windows";
  const filename = t("snippet.filename");
  const snippet = t("snippet.code");

  return (
    <section className="snippet section">
      <div className="container">
        <div className="snippet-inner">
          <div className="snippet-copy">
            <span className="section-label">{t("snippet.label")}</span>
            <h2 className="section-headline">
              {t("snippet.headline")
                .split("\n")
                .map((line, i) => (
                  <span key={i}>
                    {line}
                    {i === 0 && <br />}
                  </span>
                ))}
            </h2>
            <p className="snippet-body">{t("snippet.body")}</p>
          </div>
          <div
            className={`snippet-code-wrap ${isWindows ? "snippet-code-wrap--win" : "snippet-code-wrap--mac"}`}
          >
            <div
              className={`snippet-code-bar ${isWindows ? "snippet-code-bar--win" : "snippet-code-bar--mac"}`}
            >
              {isWindows ? (
                <WindowsWindowChrome filename={filename} />
              ) : (
                <MacWindowChrome filename={filename} />
              )}
            </div>
            <pre className="snippet-code">
              <code>{highlightJson(snippet)}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
