import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { useClientOS } from "../hooks/useClientOS";

function tokenize(code: string): ReactElement[] {
  const elements: ReactElement[] = [];
  let i = 0;
  let key = 0;

  while (i < code.length) {
    if (code[i] === '"') {
      const end = code.indexOf('"', i + 1);
      if (end === -1) break;
      const token = code.slice(i, end + 1);
      const after = code.slice(end + 1).trimStart();
      if (after.startsWith(":")) {
        elements.push(
          <span key={key++} className="tok-key">
            {token}
          </span>,
        );
      } else {
        elements.push(
          <span key={key++} className="tok-str">
            {token}
          </span>,
        );
      }
      i = end + 1;
    } else if (code[i] === "[" || code[i] === "]" || code[i] === "{" || code[i] === "}") {
      elements.push(
        <span key={key++} className="tok-brace">
          {code[i]}
        </span>,
      );
      i++;
    } else if (/[0-9-]/.test(code[i] ?? "")) {
      let num = "";
      while (i < code.length && /[0-9.-]/.test(code[i] ?? "")) {
        num += code[i++];
      }
      elements.push(
        <span key={key++} className="tok-num">
          {num}
        </span>,
      );
    } else {
      let chunk = "";
      while (
        i < code.length &&
        code[i] !== '"' &&
        !/[[{}\]]/.test(code[i] ?? "") &&
        !/[0-9]/.test(code[i] ?? "")
      ) {
        chunk += code[i++];
      }
      if (chunk)
        elements.push(
          <span key={key++} className="tok-punct">
            {chunk}
          </span>,
        );
    }
  }
  return elements;
}

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
              <code>{tokenize(snippet)}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
