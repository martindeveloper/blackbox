import { ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "../icons/Icon.js";
import { Page } from "../../lib/pages.js";
import { editorNavigate } from "../../lib/routeHelpers.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";

export function ValidationPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const issues = useScenarioStore((s) => s.validationIssues);
  const [expanded, setExpanded] = useState(false);

  if (issues.length === 0) return null;

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.length - errors.length;

  return (
    <div className="border-t border-border">
      <button
        type="button"
        className="panel-header panel-header-uppercase editor-btn-content flex w-full items-center justify-between hover:bg-surface-2"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="editor-btn-content">
          <Icon icon={ShieldAlert} size={13} />
          {t("validation.header", { errorCount: errors.length, warningCount: warnings })}
        </span>
        <Icon icon={expanded ? ChevronDown : ChevronUp} size={14} />
      </button>
      {expanded ? (
        <div className="max-h-40 overflow-y-auto px-2 pb-2">
          {issues.map((issue) => (
            <button
              key={issue.id}
              type="button"
              className={`mb-1 block w-full rounded px-2 py-1 text-left text-[10px] hover:bg-surface-2 ${
                issue.severity === "error" ? "status-error" : "editor-subtitle"
              }`}
              onClick={() => {
                if (issue.chapterId) {
                  void editorNavigate(navigate, {
                    to: Page.EditorGraph,
                    search: {
                      chapter: issue.chapterId,
                      node: issue.nodeId ?? null,
                    },
                  });
                }
              }}
            >
              {issue.message}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
