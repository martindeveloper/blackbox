import { ChevronRight, ArrowUpRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { translate } from "../../lib/i18n.js";
import { lintIssueLocationLabel, lintIssueNavigateTarget } from "../../lib/lintIssueNavigate.js";
import { editorNavigate } from "../../lib/routeHelpers.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { BundleDependencyGraph } from "./BundleDependencyGraph.js";
import type {
  BundleToolResult,
  CodecTotal,
  InspectEntry,
  LintIssue,
  LintResultStatus,
  ParsedBundleOutput,
  ParsedLintOutput,
  ParsedSimulatorOutput,
  ProjectInspectBundle,
  SimAnalytics,
  SimAnalyticsRow,
  SimGoalResult,
  SimHotNode,
  SimPerEnding,
  ToolResult,
} from "../../lib/toolsApi.js";
import { Icon } from "../icons/Icon.js";

interface ParsedOutputProps {
  result: ToolResult | BundleToolResult;
  rawText: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return translate("tools.parsed.bytes.b", { n: bytes });
  if (bytes < 1024 * 1024) {
    return translate("tools.parsed.bytes.kib", { n: (bytes / 1024).toFixed(1) });
  }
  return translate("tools.parsed.bytes.mib", { n: (bytes / (1024 * 1024)).toFixed(2) });
}

function formatSimCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function shortNodeId(id: string): string {
  if (id.length <= 28) return id;
  return `${id.slice(0, 12)}…${id.slice(-10)}`;
}

function inspectEntryStatusClass(status: InspectEntry["status"]): "ok" | "warn" | "error" {
  if (status === "WARN") return "warn";
  if (status === "ERROR") return "error";
  return "ok";
}

function RawSection({ rawText, exitCode }: { rawText: string; exitCode?: number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const label =
    exitCode !== undefined
      ? t("tools.parsed.rawOutputExit", { code: exitCode })
      : t("tools.parsed.rawOutput");
  return (
    <div className={`parsed-raw-section${open ? " parsed-raw-section--open" : ""}`}>
      {open ? (
        <>
          <button
            type="button"
            className="parsed-raw-toggle parsed-raw-toggle--open"
            onClick={() => setOpen((v) => !v)}
          >
            <Icon icon={ChevronRight} size={10} strokeWidth={2.5} />
            {label}
          </button>
          <div className="parsed-raw-output">
            <pre className="parsed-raw-pre">{rawText}</pre>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="parsed-raw-toggle parsed-raw-toggle--collapsed"
          onClick={() => setOpen((v) => !v)}
        >
          <Icon icon={ChevronRight} size={10} strokeWidth={2.5} />
          {label}
        </button>
      )}
    </div>
  );
}

function resultTagClass(result: LintResultStatus): string {
  if (result === "failed") return "parsed-result-tag--error";
  if (result === "passed with warnings") return "parsed-result-tag--warn";
  return "parsed-result-tag--ok";
}

function resultTagLabel(result: LintResultStatus): string {
  if (result === "failed") return translate("tools.status.failed");
  if (result === "passed with warnings") return translate("tools.status.warnings");
  return translate("tools.status.passed");
}

function LintIssueRow({ issue }: { issue: LintIssue }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const bundle = useScenarioStore((s) => s.bundle);
  const target = lintIssueNavigateTarget(issue, bundle);
  const locationLabel = lintIssueLocationLabel(issue);
  const detailContext = locationLabel ? null : issue.context;

  const body = (
    <>
      <span className={`parsed-issue-sev parsed-issue-sev--${issue.severity}`}>
        {issue.severity === "error" ? "E" : issue.severity === "warn" ? "W" : "I"}
      </span>
      <span className="parsed-issue-code">{issue.code}</span>
      <span className="parsed-issue-body">
        <span className="parsed-issue-message">{issue.message}</span>
        {locationLabel ? <span className="parsed-issue-location">{locationLabel}</span> : null}
        {detailContext ? <span className="parsed-issue-context">{detailContext}</span> : null}
      </span>
      {target ? (
        <Icon icon={ArrowUpRight} size={11} strokeWidth={2.5} className="parsed-issue-goto-icon" />
      ) : null}
    </>
  );

  if (!target) {
    return <div className={`parsed-issue parsed-issue--${issue.severity}`}>{body}</div>;
  }

  return (
    <button
      type="button"
      className={`parsed-issue parsed-issue--${issue.severity} parsed-issue--navigable`}
      title={t("tools.parsed.lint.goTo", { location: locationLabel ?? issue.nodeId ?? "" })}
      onClick={() => void editorNavigate(navigate, target)}
    >
      {body}
    </button>
  );
}

function LintView({
  parsed,
  rawText,
  exitCode,
}: {
  parsed: ParsedLintOutput;
  rawText: string;
  exitCode: number;
}) {
  const { t } = useTranslation();
  const { total, result } = parsed;
  const allIssues = parsed.scenarios.flatMap((s) => s.issues);

  return (
    <div className="parsed-output">
      <div className="parsed-output-body">
        <div className="parsed-summary">
          {total.errors > 0 && (
            <span className="parsed-summary-stat parsed-summary-stat--error">
              <span className="parsed-summary-dot parsed-summary-dot--error" />
              {t("common.errors", { count: total.errors })}
            </span>
          )}
          {total.warnings > 0 && (
            <span className="parsed-summary-stat parsed-summary-stat--warn">
              <span className="parsed-summary-dot parsed-summary-dot--warn" />
              {t("common.warnings", { count: total.warnings })}
            </span>
          )}
          {total.info > 0 && (
            <span className="parsed-summary-stat">
              <span className="parsed-summary-dot" />
              {t("tools.parsed.lint.infoCount", { count: total.info })}
            </span>
          )}
          {total.errors === 0 && total.warnings === 0 && total.info === 0 && (
            <span className="parsed-summary-stat">{t("tools.parsed.lint.noIssues")}</span>
          )}
          <span className={`parsed-result-tag ${resultTagClass(result)}`}>
            {resultTagLabel(result)}
          </span>
        </div>

        <div className="parsed-issues">
          {allIssues.length === 0 ? (
            <p className="parsed-empty">{t("tools.parsed.lint.clean")}</p>
          ) : (
            allIssues.map((issue, i) => <LintIssueRow key={i} issue={issue} />)
          )}
        </div>
      </div>

      <RawSection rawText={rawText} exitCode={exitCode} />
    </div>
  );
}

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

function BundleView({
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

const ANALYTICS_ROW_LIMIT = 10;

const ENDING_PALETTE = [
  "var(--sim-ending-1)",
  "var(--sim-ending-2)",
  "var(--sim-ending-3)",
  "var(--sim-ending-4)",
  "var(--sim-ending-5)",
  "var(--sim-ending-6)",
];

function AnalyticsBar({
  row,
  accent,
  showFraction = true,
}: {
  row: SimAnalyticsRow;
  accent?: "primary" | "warning" | "split";
  showFraction?: boolean;
}) {
  const pct = Math.min(Math.max(row.pct, 0), 100);
  return (
    <div className="parsed-sim-bar-row">
      <span className="parsed-sim-bar-id" title={row.id}>
        {shortNodeId(row.id)}
      </span>
      <div className="parsed-sim-bar-track">
        <div
          className={`parsed-sim-bar-fill${accent ? ` parsed-sim-bar-fill--${accent}` : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="parsed-sim-bar-stat">
        {showFraction && (
          <span className="parsed-sim-bar-count">
            {formatSimCount(row.count)}/{formatSimCount(row.total)}
          </span>
        )}
        <span className="parsed-sim-bar-pct">{Math.round(pct)}%</span>
      </span>
    </div>
  );
}

function HotNodeBar({ node, accent }: { node: SimHotNode; accent?: boolean }) {
  const { t } = useTranslation();
  const pct = Math.min(Math.max(node.reachPct, 0), 100);
  return (
    <div className="parsed-sim-bar-row parsed-sim-bar-row--hot">
      <span className="parsed-sim-bar-id" title={node.id}>
        {shortNodeId(node.id)}
      </span>
      <div className="parsed-sim-bar-track">
        <div
          className={`parsed-sim-bar-fill${accent ? " parsed-sim-bar-fill--split" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="parsed-sim-bar-stat parsed-sim-bar-stat--hot">
        <span className="parsed-sim-bar-visits" title={t("tools.parsed.sim.totalVisitsTitle")}>
          {formatSimCount(node.visits)}×
        </span>
        <span className="parsed-sim-bar-pct" title={t("tools.parsed.sim.reachTitle")}>
          {Math.round(pct)}%
        </span>
        <span
          className={`parsed-sim-bar-degree${node.outDegree <= 1 ? " is-linear" : ""}`}
          title={t("tools.parsed.sim.authoredChoices", { count: node.outDegree })}
        >
          {node.outDegree}→
        </span>
      </span>
    </div>
  );
}

function ExpandableSection({
  title,
  subtitle,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`parsed-sim-section${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="parsed-sim-section-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon
          icon={ChevronRight}
          size={11}
          strokeWidth={2.5}
          className="parsed-sim-section-caret"
        />
        <span className="parsed-sim-section-title">{title}</span>
        {count != null && <span className="parsed-sim-section-count">{count}</span>}
        {subtitle && <span className="parsed-sim-section-sub">{subtitle}</span>}
      </button>
      {open && <div className="parsed-sim-section-body">{children}</div>}
    </section>
  );
}

function RankedList<T>({
  items,
  limit,
  render,
}: {
  items: T[];
  limit: number;
  render: (item: T, index: number) => ReactNode;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const visible = expanded ? items : items.slice(0, limit);
  const extra = items.length - limit;
  return (
    <>
      <div className="parsed-sim-ranked-list">{visible.map((item, i) => render(item, i))}</div>
      {extra > 0 && (
        <button
          type="button"
          className="parsed-sim-expand-btn"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? t("tools.parsed.sim.showLess")
            : t("tools.parsed.sim.showMore", { count: extra })}
        </button>
      )}
    </>
  );
}

function EndingDistribution({ rows, totalPaths }: { rows: SimAnalyticsRow[]; totalPaths: number }) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const lead = sorted[0];
  const maxPct = lead?.pct ?? 0;
  const even = lead != null && sorted.every((r) => Math.abs(r.pct - lead.pct) < 0.01);

  return (
    <div className="parsed-sim-endings">
      <div className="parsed-sim-endings-strip" aria-hidden>
        {sorted.map((row, i) => (
          <div
            key={row.id}
            className="parsed-sim-endings-segment"
            style={{
              flex: row.count,
              background: ENDING_PALETTE[i % ENDING_PALETTE.length],
            }}
            title={`${row.id}: ${Math.round(row.pct)}%`}
          />
        ))}
      </div>
      <div className="parsed-sim-endings-meta">
        <span className="parsed-sim-endings-total">
          {t("tools.parsed.sim.pathsTotal", { paths: formatSimCount(totalPaths) })}
        </span>
        <span className="parsed-sim-endings-balance">
          {even
            ? t("tools.parsed.sim.evenSplit")
            : t("tools.parsed.sim.dominantPct", { pct: Math.round(maxPct) })}
        </span>
      </div>
      <div className="parsed-sim-endings-legend">
        {sorted.map((row, i) => (
          <div key={row.id} className="parsed-sim-ending-row">
            <span
              className="parsed-sim-ending-swatch"
              style={{ background: ENDING_PALETTE[i % ENDING_PALETTE.length] }}
            />
            <span className="parsed-sim-ending-id" title={row.id}>
              {shortNodeId(row.id)}
            </span>
            <div className="parsed-sim-ending-bar-track">
              <div
                className="parsed-sim-ending-bar-fill"
                style={{
                  width: `${Math.min(row.pct, 100)}%`,
                  background: ENDING_PALETTE[i % ENDING_PALETTE.length],
                }}
              />
            </div>
            <span className="parsed-sim-ending-stat">
              {formatSimCount(row.count)} · {Math.round(row.pct)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MandatorySpine({ nodes, totalEndings }: { nodes: string[]; totalEndings: number }) {
  const { t } = useTranslation();
  if (nodes.length === 0) {
    return (
      <p className="parsed-sim-spine-empty">
        {t("tools.parsed.sim.spineEmpty", { count: totalEndings })}
      </p>
    );
  }
  return (
    <div className="parsed-sim-spine">
      <div className="parsed-sim-spine-track">
        {nodes.map((n, i) => (
          <div key={n} className="parsed-sim-spine-node">
            {i > 0 && <span className="parsed-sim-spine-link" aria-hidden />}
            <span className="parsed-sim-spine-chip" title={n}>
              {shortNodeId(n)}
            </span>
          </div>
        ))}
      </div>
      <p className="parsed-sim-spine-note">
        {t("tools.parsed.sim.spineNote", { count: nodes.length })}
      </p>
    </div>
  );
}

function PerEndingGroup({ ending, index }: { ending: SimPerEnding; index: number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(index < 2);
  const color = ENDING_PALETTE[index % ENDING_PALETTE.length];
  return (
    <div className="parsed-sim-route">
      <button type="button" className="parsed-sim-route-toggle" onClick={() => setOpen((v) => !v)}>
        <Icon
          icon={ChevronRight}
          size={11}
          strokeWidth={2.5}
          className={`parsed-sim-route-caret${open ? " is-open" : ""}`}
        />
        <span className="parsed-sim-route-swatch" style={{ background: color }} />
        <span className="parsed-sim-route-name" title={ending.ending}>
          {shortNodeId(ending.ending)}
        </span>
        <span className="parsed-sim-route-paths">
          {t("tools.parsed.sim.routePaths", {
            count: ending.pathCount,
            paths: formatSimCount(ending.pathCount),
          })}
        </span>
        <span className="parsed-sim-route-unique">
          {t("tools.parsed.sim.routeUniqueNodes", {
            count: ending.nodes.length,
            nodes: ending.nodes.length,
          })}
        </span>
      </button>
      {open && (
        <div className="parsed-sim-route-nodes">
          {ending.nodes.length === 0 ? (
            <span className="parsed-sim-route-empty">{t("tools.parsed.sim.routeEmpty")}</span>
          ) : (
            ending.nodes.map((node) => {
              const pct = Math.min(Math.max(node.reachPct, 0), 100);
              return (
                <div key={node.id} className="parsed-sim-bar-row">
                  <span className="parsed-sim-bar-id" title={node.id}>
                    {shortNodeId(node.id)}
                  </span>
                  <div className="parsed-sim-bar-track">
                    <div
                      className="parsed-sim-bar-fill"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                  <span className="parsed-sim-bar-pct">{Math.round(pct)}%</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function SimAnalyticsView({ analytics }: { analytics: SimAnalytics }) {
  const { t } = useTranslation();
  const splitCount = analytics.splitCandidates?.length ?? 0;

  return (
    <div className="parsed-sim-analytics">
      <header className="parsed-sim-analytics-header">
        <span className="parsed-sim-analytics-title">
          {t("tools.parsed.sim.narrativeAnalytics")}
        </span>
        <span className="parsed-sim-analytics-kpi">
          {t("tools.parsed.sim.pathsEndings", {
            paths: formatSimCount(analytics.totalPaths),
            endings: analytics.totalEndings,
          })}
        </span>
      </header>

      <ExpandableSection
        title={t("tools.parsed.sim.hotPaths")}
        subtitle={t("tools.parsed.sim.hotPathsSub")}
        defaultOpen
      >
        <EndingDistribution rows={analytics.accessibility} totalPaths={analytics.totalPaths} />
      </ExpandableSection>

      {splitCount > 0 && (
        <ExpandableSection
          title={t("tools.parsed.sim.splitCandidates")}
          subtitle={t("tools.parsed.sim.splitCandidatesSub")}
          count={splitCount}
          defaultOpen
        >
          <RankedList
            items={analytics.splitCandidates ?? []}
            limit={ANALYTICS_ROW_LIMIT}
            render={(node) => <HotNodeBar key={node.id} node={node} accent />}
          />
        </ExpandableSection>
      )}

      <ExpandableSection
        title={t("tools.parsed.sim.storySpine")}
        subtitle={t("tools.parsed.sim.storySpineSub")}
        count={analytics.mandatoryNodes.length}
        defaultOpen={analytics.mandatoryNodes.length > 0}
      >
        <MandatorySpine nodes={analytics.mandatoryNodes} totalEndings={analytics.totalEndings} />
      </ExpandableSection>

      {analytics.importance.length > 0 && (
        <ExpandableSection
          title={t("tools.parsed.sim.branchingHotspots")}
          subtitle={t("tools.parsed.sim.branchingHotspotsSub")}
          count={analytics.importance.length}
          defaultOpen={false}
        >
          <div className="parsed-sim-col-head">
            <span>{t("tools.parsed.sim.colNode")}</span>
            <span>{t("tools.parsed.sim.colShare")}</span>
            <span>{t("tools.parsed.sim.colEndings")}</span>
          </div>
          <RankedList
            items={analytics.importance}
            limit={ANALYTICS_ROW_LIMIT}
            render={(row) => <AnalyticsBar key={row.id} row={row} accent="primary" />}
          />
        </ExpandableSection>
      )}

      {analytics.hotNodes.length > 0 && (
        <ExpandableSection
          title={t("tools.parsed.sim.traffic")}
          subtitle={t("tools.parsed.sim.trafficSub")}
          count={analytics.hotNodes.length}
          defaultOpen={false}
        >
          <div className="parsed-sim-col-head parsed-sim-col-head--hot">
            <span>{t("tools.parsed.sim.colNode")}</span>
            <span>{t("tools.parsed.sim.colReach")}</span>
            <span>{t("tools.parsed.sim.colVisitsReachOut")}</span>
          </div>
          <RankedList
            items={analytics.hotNodes}
            limit={ANALYTICS_ROW_LIMIT}
            render={(node) => <HotNodeBar key={node.id} node={node} />}
          />
        </ExpandableSection>
      )}

      {(analytics.perEnding?.length ?? 0) > 0 && (
        <ExpandableSection
          title={t("tools.parsed.sim.perRouteSignature")}
          subtitle={t("tools.parsed.sim.perRouteSignatureSub")}
          count={analytics.perEnding?.length}
          defaultOpen={false}
        >
          {analytics.perEnding?.map((ending, i) => (
            <PerEndingGroup key={ending.ending} ending={ending} index={i} />
          ))}
        </ExpandableSection>
      )}
    </div>
  );
}

function CoverageBar({
  label,
  visited,
  total,
  pct,
}: {
  label: string;
  visited: number;
  total: number;
  pct: number;
}) {
  const clamped = Math.min(pct, 100);
  return (
    <div className="parsed-sim-coverage-row">
      <span className="parsed-sim-coverage-label">{label}</span>
      <div className="parsed-sim-coverage-bar-wrap">
        <div className="parsed-sim-coverage-bar" style={{ width: `${clamped}%` }} />
      </div>
      <span className="parsed-sim-coverage-stat">
        {visited}/{total} ({pct.toFixed(1)}%)
      </span>
    </div>
  );
}

function SimStatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "ok" | "warn" | "error" | "neutral";
}) {
  return (
    <div className={`parsed-sim-stat${tone ? ` parsed-sim-stat--${tone}` : ""}`}>
      <span className="parsed-sim-stat-label">{label}</span>
      <span className="parsed-sim-stat-value">{value}</span>
      {detail && <span className="parsed-sim-stat-detail">{detail}</span>}
    </div>
  );
}

function GoalRow({ goal }: { goal: SimGoalResult }) {
  const { t } = useTranslation();
  const status = goal.reached ? "ok" : goal.static ? "static" : "fail";
  return (
    <div className={`parsed-sim-goal-row parsed-sim-goal-row--${status}`}>
      <span className="parsed-sim-goal-status" aria-hidden>
        {goal.reached ? "✓" : goal.static ? "⊘" : "✗"}
      </span>
      <div className="parsed-sim-goal-main">
        <span className="parsed-sim-goal-id" title={goal.id}>
          {shortNodeId(goal.id)}
        </span>
        {goal.static && (
          <span className="parsed-sim-goal-tag parsed-sim-goal-tag--static">
            {t("tools.parsed.sim.staticallyUnreachable")}
          </span>
        )}
        {!goal.reached && !goal.static && goal.hint && (
          <span className="parsed-sim-goal-hint">
            {t("tools.parsed.sim.closestHint", { node: shortNodeId(goal.hint) })}
          </span>
        )}
      </div>
      <div className="parsed-sim-goal-metrics">
        {goal.states && (
          <span className="parsed-sim-goal-metric">
            <strong>{goal.states}</strong> {t("tools.parsed.sim.states")}
          </span>
        )}
        {goal.choices && (
          <span className="parsed-sim-goal-metric">
            <strong>{goal.choices}</strong> {t("tools.parsed.sim.choices")}
          </span>
        )}
      </div>
    </div>
  );
}

function FinishabilityPanel({
  goals,
  goalsReached,
  goalsTotal,
  mode,
}: {
  goals: SimGoalResult[];
  goalsReached: number | null;
  goalsTotal: number | null;
  mode: ParsedSimulatorOutput["mode"];
}) {
  const { t } = useTranslation();
  if (mode !== "goals" || goals.length === 0) return null;

  const reached = goalsReached ?? goals.filter((g) => g.reached).length;
  const total = goalsTotal ?? goals.length;
  const allOk = reached === total;
  const anyStatic = goals.some((g) => g.static);
  const failed = goals.filter((g) => !g.reached && !g.static);
  const tone = allOk ? "ok" : anyStatic ? "warn" : "error";
  const blockedCount = total - reached;

  return (
    <section className={`parsed-sim-finish parsed-sim-finish--${tone}`}>
      <div className="parsed-sim-finish-banner">
        <div className="parsed-sim-finish-ring" aria-hidden>
          <svg viewBox="0 0 36 36" className="parsed-sim-finish-svg">
            <circle cx="18" cy="18" r="15.5" className="parsed-sim-finish-ring-bg" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              className="parsed-sim-finish-ring-fill"
              strokeDasharray={`${(reached / Math.max(total, 1)) * 97.4} 97.4`}
            />
          </svg>
          <span className="parsed-sim-finish-ratio">
            {reached}/{total}
          </span>
        </div>
        <div className="parsed-sim-finish-copy">
          <span className="parsed-sim-finish-headline">
            {allOk
              ? t("tools.parsed.sim.finishAllOk")
              : t("tools.parsed.sim.finishBlocked", { count: blockedCount })}
          </span>
          <span className="parsed-sim-finish-sub">
            {allOk
              ? t("tools.parsed.sim.finishAllOkSub")
              : anyStatic
                ? t("tools.parsed.sim.finishStaticSub")
                : t("tools.parsed.sim.finishExhaustedSub")}
          </span>
        </div>
      </div>
      <div className="parsed-sim-finish-list">
        {goals.map((goal) => (
          <GoalRow key={goal.id} goal={goal} />
        ))}
      </div>
      {failed.length > 0 && (
        <p className="parsed-sim-finish-action">
          {t("tools.parsed.sim.finishActionBlocked", { count: failed.length })}
        </p>
      )}
    </section>
  );
}

function SimulatorView({
  parsed,
  rawText,
  exitCode,
}: {
  parsed: ParsedSimulatorOutput;
  rawText: string;
  exitCode: number;
}) {
  const { t } = useTranslation();
  const { result, issueSummary, goals, coverage, analytics } = parsed;
  const issueCount = issueSummary.errors + issueSummary.warnings + issueSummary.info;
  const goalsReached = parsed.goalsReached ?? goals.filter((g) => g.reached).length;
  const goalsTotal = parsed.goalsTotal ?? goals.length;
  const allGoalsOk = goals.every((g) => g.reached);

  let finishTone: "ok" | "warn" | "error" | "neutral" = "neutral";
  if (parsed.mode === "goals" && goals.length > 0) {
    finishTone = allGoalsOk ? "ok" : goals.some((g) => g.static) ? "warn" : "error";
  }

  return (
    <div className="parsed-output parsed-output--sim">
      <div className="parsed-output-body">
        <div className="parsed-sim-header">
          <div className="parsed-sim-title-block">
            <span className="parsed-sim-title">{parsed.title}</span>
            <span className="parsed-sim-revision">v{parsed.revision}</span>
          </div>
          <span className={`parsed-result-tag ${resultTagClass(result)}`}>
            {resultTagLabel(result)}
          </span>
        </div>

        <div className="parsed-sim-dashboard">
          <SimStatCard
            label={t("tools.parsed.sim.statMode")}
            value={parsed.mode}
            detail={
              parsed.mode === "goals"
                ? t("tools.parsed.sim.goalSearch")
                : t("tools.parsed.sim.stateExplore")
            }
          />
          {parsed.loaded && (
            <SimStatCard
              label={t("tools.parsed.sim.statGraph")}
              value={`${parsed.loaded.nodes}`}
              detail={t("tools.parsed.sim.graphDetail", {
                choices: parsed.loaded.choices,
                chapters: parsed.loaded.chapters,
              })}
            />
          )}
          {parsed.mode === "goals" && goals.length > 0 && (
            <SimStatCard
              label={t("tools.parsed.sim.statFinishable")}
              value={`${goalsReached}/${goalsTotal}`}
              detail={allGoalsOk ? t("tools.parsed.sim.allReached") : t("tools.parsed.sim.blocked")}
              tone={finishTone}
            />
          )}
          {parsed.mode === "explore" && parsed.statesExplored && (
            <SimStatCard
              label={t("tools.parsed.sim.statExplored")}
              value={parsed.statesExplored}
              detail={t("tools.parsed.sim.statesVisited")}
            />
          )}
          {coverage?.nodes && (
            <SimStatCard
              label={t("tools.parsed.sim.statCoverage")}
              value={`${coverage.nodes.pct.toFixed(0)}%`}
              detail={t("tools.parsed.sim.nodesCoverage", {
                visited: coverage.nodes.visited,
                total: coverage.nodes.total,
              })}
              tone={coverage.nodes.pct >= 90 ? "ok" : coverage.nodes.pct >= 50 ? "warn" : "error"}
            />
          )}
          {analytics && (
            <SimStatCard
              label={t("tools.parsed.sim.statPaths")}
              value={formatSimCount(analytics.totalPaths)}
              detail={t("tools.parsed.sim.endingsCount", { count: analytics.totalEndings })}
            />
          )}
          {issueCount > 0 && (
            <SimStatCard
              label={t("tools.parsed.sim.statIssues")}
              value={String(issueCount)}
              detail={
                issueSummary.errors > 0
                  ? t("common.errors", { count: issueSummary.errors })
                  : t("tools.parsed.sim.warnCount", { count: issueSummary.warnings })
              }
              tone={issueSummary.errors > 0 ? "error" : "warn"}
            />
          )}
        </div>

        <FinishabilityPanel
          goals={goals}
          goalsReached={parsed.goalsReached}
          goalsTotal={parsed.goalsTotal}
          mode={parsed.mode}
        />

        {coverage && (coverage.nodes || coverage.choices) && parsed.mode === "explore" && (
          <div className="parsed-sim-coverage">
            <span className="parsed-sim-coverage-heading">
              {t("tools.parsed.sim.explorationCoverage")}
            </span>
            {coverage.nodes && (
              <CoverageBar
                label={t("dashboard.stat.nodes")}
                visited={coverage.nodes.visited}
                total={coverage.nodes.total}
                pct={coverage.nodes.pct}
              />
            )}
            {coverage.choices && (
              <CoverageBar
                label={t("dashboard.stat.choices")}
                visited={coverage.choices.visited}
                total={coverage.choices.total}
                pct={coverage.choices.pct}
              />
            )}
          </div>
        )}

        {parsed.issues.length > 0 && (
          <div className="parsed-sim-issues-block">
            <div className="parsed-sim-issues-head">
              <span className="parsed-sim-issues-title">
                {t("tools.parsed.sim.structuralIssues")}
              </span>
              <div className="parsed-sim-issues-counts">
                {issueSummary.errors > 0 && (
                  <span className="parsed-sim-issues-count parsed-sim-issues-count--error">
                    {issueSummary.errors}E
                  </span>
                )}
                {issueSummary.warnings > 0 && (
                  <span className="parsed-sim-issues-count parsed-sim-issues-count--warn">
                    {issueSummary.warnings}W
                  </span>
                )}
                {issueSummary.info > 0 && (
                  <span className="parsed-sim-issues-count">{issueSummary.info}I</span>
                )}
              </div>
            </div>
            <div className="parsed-issues">
              {parsed.issues.map((issue, i) => (
                <div key={i} className={`parsed-issue parsed-issue--${issue.severity}`}>
                  <span className={`parsed-issue-sev parsed-issue-sev--${issue.severity}`}>
                    {issue.severity === "error" ? "E" : issue.severity === "warn" ? "W" : "I"}
                  </span>
                  {issue.code && <span className="parsed-issue-code">{issue.code}</span>}
                  <span className="parsed-issue-body">
                    <span className="parsed-issue-message">{issue.message}</span>
                    {issue.path && <span className="parsed-issue-context">{issue.path}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {parsed.analytics && <SimAnalyticsView analytics={parsed.analytics} />}
      </div>

      <RawSection rawText={rawText} exitCode={exitCode} />
    </div>
  );
}

export function ParsedOutput({ result, rawText }: ParsedOutputProps) {
  const { t } = useTranslation();
  const { parsed } = result;

  if (parsed?.kind === "lint") {
    return <LintView parsed={parsed} rawText={rawText} exitCode={result.exitCode} />;
  }

  if (parsed?.kind === "bundle") {
    return <BundleView parsed={parsed} rawText={rawText} exitCode={result.exitCode} />;
  }

  if (parsed?.kind === "simulator") {
    return <SimulatorView parsed={parsed} rawText={rawText} exitCode={result.exitCode} />;
  }

  return (
    <>
      <div className="tools-output-header">
        <span className="tools-output-label">{t("tools.output")}</span>
        <span className="tools-output-header-end">
          <span className={`tools-exit-code${result.ok ? " tools-exit-code--ok" : ""}`}>
            {t("tools.exitCode", { code: result.exitCode })}
          </span>
        </span>
      </div>
      <div className="tools-output-body">
        <pre className="tools-output-pre">{rawText || t("tools.noOutput")}</pre>
      </div>
    </>
  );
}
