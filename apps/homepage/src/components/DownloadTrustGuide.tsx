import { useTranslation } from "react-i18next";
import type { DownloadPlatform } from "@/lib/releaseAssets";
import { ShellCodeBlock } from "@/components/ShellCodeBlock";

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

      <ShellCodeBlock
        platform={platform}
        filename={guide.shell_filename}
        commands={guide.commands}
        className="download-trust-code"
      />
    </section>
  );
}
