import { useTranslation } from "react-i18next";
import type { DownloadPlatform } from "../lib/releaseAssets";

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

function InstallCodeBlock({
  platform,
  filename,
  commands,
}: {
  platform: "macos" | "windows";
  filename: string;
  commands: string;
}) {
  const isWindows = platform === "windows";

  return (
    <div
      className={`snippet-code-wrap download-trust-code${isWindows ? " snippet-code-wrap--win" : " snippet-code-wrap--mac"}`}
    >
      <div
        className={`snippet-code-bar${isWindows ? " snippet-code-bar--win" : " snippet-code-bar--mac"}`}
      >
        {isWindows ? (
          <WindowsWindowChrome filename={filename} />
        ) : (
          <MacWindowChrome filename={filename} />
        )}
      </div>
      <pre className="snippet-code">
        <code>{commands}</code>
      </pre>
    </div>
  );
}

export function DownloadTrustGuide({ platform }: { platform: DownloadPlatform }) {
  const { t } = useTranslation();

  if (platform !== "macos" && platform !== "windows") {
    return null;
  }

  const guide = t(`downloadPage.unsigned.${platform}`, { returnObjects: true }) as {
    title: string;
    note: string;
    steps: string[];
    shell_filename: string;
    commands: string;
    bundled_hint?: string;
  };

  return (
    <section className="download-trust" aria-labelledby="download-trust-title">
      <header className="download-trust-head">
        <h2 id="download-trust-title">{guide.title}</h2>
        <p>{guide.note}</p>
      </header>

      <ol className="download-trust-steps">
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      {guide.bundled_hint ? <p className="download-trust-hint">{guide.bundled_hint}</p> : null}

      <InstallCodeBlock
        platform={platform}
        filename={guide.shell_filename}
        commands={guide.commands}
      />
    </section>
  );
}
