import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { lintIssueLocationLabel, lintIssueNavigateTarget } from "@/lib/lintIssueNavigate.js";
import { editorNavigate } from "@/lib/routeHelpers.js";
import { useScenarioStore } from "@/store/useScenarioStore.js";
import type { LintIssue, ParsedLintOutput } from "@/lib/toolsApi.js";
import { Icon } from "@/components/icons/Icon.js";
import { resultTagClass, resultTagLabel } from "./format.js";
import { RawSection } from "./RawSection.js";

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

export function LintView({
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
