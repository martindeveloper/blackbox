import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import { Icon } from "../icons/Icon.js";
import { useBuildStore } from "../../store/useBuildStore.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { stagesForPlatform, type BuildRunState } from "../../lib/buildApi.js";

const RUN_STATUS_KEY: Record<BuildRunState, string> = {
  running: "build.running",
  done: "build.succeeded",
  error: "build.failed",
  canceled: "build.canceled",
};

const STATUS_ICON = {
  ready: CircleDashed,
  running: Loader2,
  done: CheckCircle2,
  error: XCircle,
  canceled: XCircle,
} as const;

export function BuildInspector() {
  const { t } = useTranslation();
  const projectName = useScenarioStore((s) => s.projectName);
  const { platform, configuration, selectedStages, run, capabilities } = useBuildStore();

  const status = run?.state ?? "ready";
  const StatusIcon = STATUS_ICON[status];
  const statusLabel = run ? t(RUN_STATUS_KEY[run.state]) : t("build.ready");
  const artifact = run?.state === "done" ? run.artifact : null;
  const packageWarning =
    selectedStages.includes("package") && capabilities?.[platform]?.package.reasons.length
      ? capabilities[platform].package.reasons.join(" · ")
      : null;

  return (
    <div className="build-inspector">
      <section className={`build-inspector-status build-inspector-status--${status}`}>
        <span className="build-inspector-status-icon">
          <Icon
            icon={StatusIcon}
            size={15}
            className={status === "running" ? "build-spin" : undefined}
          />
        </span>
        <span className="build-inspector-status-copy">
          <span className="build-inspector-kicker">{t("build.status")}</span>
          <span className="build-inspector-status-label">{statusLabel}</span>
        </span>
      </section>

      <dl className="build-inspector-meta">
        <div>
          <dt>{t("tools.inspector.project")}</dt>
          <dd>{projectName ?? t("app.noProject")}</dd>
        </div>
        <div>
          <dt>{t("build.target")}</dt>
          <dd>
            {t("build.targetSummary", {
              platform: t(
                `build.platform${platform === "ios" ? "Ios" : platform === "web" ? "Web" : "Android"}`,
              ),
              configuration: t(
                configuration === "debug" ? "build.configDebug" : "build.configRelease",
              ),
            })}
          </dd>
        </div>
        <div>
          <dt>{t("build.selectStages")}</dt>
          <dd>
            {stagesForPlatform(platform)
              .filter((stage) => selectedStages.includes(stage))
              .map((stage) => t(`build.stage.${stage}`))
              .join(" -> ")}
          </dd>
        </div>
      </dl>

      <section className="build-inspector-section">
        <span className="build-inspector-heading">{t("build.output")}</span>
        {artifact ? (
          <code className="build-inspector-path">{artifact}</code>
        ) : (
          <span className="build-inspector-empty">{t("build.outputNone")}</span>
        )}
      </section>

      <section className="build-inspector-section">
        <span className="build-inspector-heading">{t("build.packageWarning")}</span>
        {packageWarning ? (
          <div className="build-inspector-warning" role="note">
            <span className="build-inspector-warning-icon">
              <Icon icon={AlertTriangle} size={13} />
            </span>
            <span>{packageWarning}</span>
          </div>
        ) : (
          <span className="build-inspector-empty">{t("build.noWarnings")}</span>
        )}
      </section>
    </div>
  );
}
