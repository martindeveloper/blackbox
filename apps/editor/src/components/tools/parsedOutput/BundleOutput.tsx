import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  CodecTotal,
  InspectEntry,
  ParsedBundleOutput,
  ProjectInspectBundle,
} from "@/lib/toolsApi.js";
import { BundleDependencyGraph } from "@/components/tools/BundleDependencyGraph.js";
import { formatBytes, inspectEntryStatusClass } from "./format.js";
import { RawSection } from "./RawSection.js";

function InspectEntryTable({ entries }: { entries: InspectEntry[] }) {
  const { t } = useTranslation();
  if (entries.length === 0) return null;

  return (
    <table className="parsed-table">
      <thead className="parsed-table-head">
        <tr>
          <th></th>
          <th>{t("tools.parsed.inspect.key")}</th>
          <th>{t("tools.parsed.inspect.codec")}</th>
          <th>{t("tools.parsed.inspect.sniffed")}</th>
          <th className="parsed-table-bytes-col">{t("common.size")}</th>
          <th>{t("tools.parsed.inspect.note")}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, i) => {
          const statusClass = inspectEntryStatusClass(entry.status);
          return (
            <tr key={`${entry.key}-${i}`} className={`parsed-table-row--${statusClass}`}>
              <td className="parsed-table-status-cell">
                <span className={`parsed-status-badge parsed-status-badge--${statusClass}`}>
                  {entry.status}
                </span>
              </td>
              <td className="parsed-table-key">{entry.key}</td>
              <td className="parsed-table-codec">{entry.codec}</td>
              <td className="parsed-table-sniffed">{entry.sniffed}</td>
              <td className="parsed-table-bytes">{formatBytes(entry.bytes)}</td>
              <td className="parsed-table-note">{entry.note}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function InspectCodecTotals({ totals }: { totals: CodecTotal[] }) {
  const { t } = useTranslation();
  if (totals.length === 0) return null;

  return (
    <div className="parsed-codec-totals">
      {totals.map((ct) => (
        <span key={ct.codec} className="parsed-codec-total">
          <span className="parsed-codec-name">{ct.codec}</span>
          <span className="parsed-codec-count">
            {t("tools.parsed.inspect.codecFiles", {
              count: ct.files,
              size: formatBytes(ct.bytes),
            })}
          </span>
        </span>
      ))}
    </div>
  );
}

function ProjectBundleSection({
  bundle,
  selected,
  onSelect,
}: {
  bundle: ProjectInspectBundle;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <section
      className={`parsed-project-bundle-section${selected ? " parsed-project-bundle-section--selected" : ""}`}
    >
      <header
        className="parsed-project-bundle parsed-project-bundle--interactive"
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect?.();
          }
        }}
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        aria-pressed={selected}
      >
        <span className="parsed-project-bundle-kind">{bundle.kind}</span>
        <span className="parsed-project-bundle-name">{bundle.name}</span>
        <span className="parsed-project-bundle-meta">
          {t("tools.parsed.inspect.bundleEntries", {
            count: bundle.entryCount,
            size: formatBytes(bundle.blobBytes),
          })}
          {bundle.bundleId ? ` · ${bundle.bundleId}` : ""}
        </span>
        {bundle.dependencies.length > 0 && (
          <span className="parsed-project-bundle-deps">
            {t("tools.parsed.inspect.deps", { list: bundle.dependencies.join(", ") })}
          </span>
        )}
      </header>
      <InspectEntryTable entries={bundle.entries} />
      <InspectCodecTotals totals={bundle.codecTotals} />
    </section>
  );
}

export function BundleView({
  parsed,
  rawText,
  exitCode,
}: {
  parsed: ParsedBundleOutput;
  rawText: string;
  exitCode: number;
}) {
  const { t } = useTranslation();
  const { bundle, inspect, bundleStderr } = parsed;
  const isProject = (inspect?.bundles?.length ?? 0) > 0;
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);

  return (
    <div className="parsed-output">
      <div className="parsed-output-body">
        {bundle && (
          <div className="parsed-bundle-header">
            <span className="parsed-result-tag parsed-result-tag--ok">✓</span>
            <div className="parsed-bundle-written">
              <span className="parsed-bundle-filename">
                {isProject
                  ? t("tools.parsed.inspect.projectBundle")
                  : (bundle.outputPath.split("/").pop() ?? bundle.outputPath)}
              </span>
              <div className="parsed-bundle-meta">
                <span className="parsed-bundle-size">{bundle.size}</span>
                <span className="parsed-bundle-pill">{bundle.platform}</span>
                {bundle.chapterCount != null && (
                  <span className="parsed-bundle-pill">
                    {t("tools.parsed.inspect.chapterCount", { count: bundle.chapterCount })}
                  </span>
                )}
                {bundle.transcode && (
                  <span className="parsed-bundle-pill">{t("tools.parsed.inspect.transcode")}</span>
                )}
                {bundle.archive !== "none" && (
                  <span className="parsed-bundle-pill">{bundle.archive}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {bundleStderr && (
          <div className="parsed-bundle-stderr">
            <pre className="parsed-raw-pre">{bundleStderr}</pre>
          </div>
        )}

        {inspect && (
          <div className="parsed-inspect">
            <div className="parsed-inspect-meta">
              <span className="parsed-inspect-meta-item">
                <span className="parsed-inspect-meta-label">
                  {t("tools.parsed.inspect.scenario")}
                </span>
                <span className="parsed-inspect-meta-value">{inspect.scenario}</span>
              </span>
              <span className="parsed-inspect-meta-sep" aria-hidden />
              <span className="parsed-inspect-meta-item">
                <span className="parsed-inspect-meta-label">
                  {t("tools.parsed.inspect.platform")}
                </span>
                <span className="parsed-inspect-meta-value">{inspect.platform}</span>
              </span>
              {isProject ? (
                <>
                  <span className="parsed-inspect-meta-sep" aria-hidden />
                  <span className="parsed-inspect-meta-item">
                    <span className="parsed-inspect-meta-label">
                      {t("tools.parsed.inspect.bundles")}
                    </span>
                    <span className="parsed-inspect-meta-value">{inspect.bundles.length}</span>
                  </span>
                  <span className="parsed-inspect-meta-sep" aria-hidden />
                  <span className="parsed-inspect-meta-item">
                    <span className="parsed-inspect-meta-label">
                      {t("tools.parsed.inspect.entries")}
                    </span>
                    <span className="parsed-inspect-meta-value">{inspect.entryCount}</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="parsed-inspect-meta-sep" aria-hidden />
                  <span className="parsed-inspect-meta-item">
                    <span className="parsed-inspect-meta-label">
                      {t("tools.parsed.inspect.entries")}
                    </span>
                    <span className="parsed-inspect-meta-value">{inspect.entryCount}</span>
                  </span>
                  <span className="parsed-inspect-meta-sep" aria-hidden />
                  <span className="parsed-inspect-meta-item">
                    <span className="parsed-inspect-meta-label">
                      {t("tools.parsed.inspect.header")}
                    </span>
                    <span className="parsed-inspect-meta-value">
                      {inspect.headerOk
                        ? t("tools.parsed.inspect.headerOk")
                        : t("tools.parsed.inspect.headerInvalid")}
                    </span>
                  </span>
                </>
              )}
              <span
                className={`parsed-result-tag ${inspect.result === "ok" ? "parsed-result-tag--ok" : "parsed-result-tag--error"}`}
              >
                {inspect.result === "ok"
                  ? t("tools.parsed.inspect.valid")
                  : t("tools.parsed.inspect.invalid")}
              </span>
            </div>

            {isProject && (
              <>
                <BundleDependencyGraph
                  bundles={inspect.bundles}
                  selectedId={selectedBundleId}
                  onSelect={setSelectedBundleId}
                />
                <div className="parsed-project-bundles">
                  {inspect.bundles.map((entry) => {
                    const entryKey = entry.bundleId ?? entry.name;
                    return (
                      <ProjectBundleSection
                        key={`${entry.kind}-${entry.name}`}
                        bundle={entry}
                        selected={selectedBundleId === entryKey}
                        onSelect={() =>
                          setSelectedBundleId((current) => (current === entryKey ? null : entryKey))
                        }
                      />
                    );
                  })}
                </div>
              </>
            )}

            {!isProject && inspect.entries.length > 0 && (
              <InspectEntryTable entries={inspect.entries} />
            )}

            {!isProject && inspect.codecTotals.length > 0 && (
              <InspectCodecTotals totals={inspect.codecTotals} />
            )}

            {(inspect.errors.length > 0 || inspect.warnings.length > 0) && (
              <div className="parsed-inspect-alerts">
                {inspect.errors.map((err, i) => (
                  <div key={`e${i}`} className="parsed-inspect-alert parsed-inspect-alert--error">
                    <span aria-hidden>✕</span>
                    <span>{err}</span>
                  </div>
                ))}
                {inspect.warnings.map((w, i) => (
                  <div key={`w${i}`} className="parsed-inspect-alert parsed-inspect-alert--warn">
                    <span aria-hidden>!</span>
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <RawSection rawText={rawText} exitCode={exitCode} />
    </div>
  );
}
