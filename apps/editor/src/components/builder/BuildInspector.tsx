import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, CircleDashed, FolderOpen, Loader2, XCircle } from "lucide-react";
import { Icon } from "../icons/Icon.js";
import { Button } from "../ui/Button.js";
import { FormField } from "../ui/FormField.js";
import { Section, SectionBody, SectionHeader } from "../ui/Section.js";
import { revealPath } from "../../lib/revealPath.js";
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

type BuildStatus = BuildRunState | "ready";

const STATUS_CLASS: Record<BuildStatus, string> = {
  ready: "build-inspector-status",
  running: "build-inspector-status build-inspector-status--running",
  done: "build-inspector-status build-inspector-status--done",
  error: "build-inspector-status build-inspector-status--error",
  canceled: "build-inspector-status build-inspector-status--canceled",
};

export function BuildInspector() {
  const { t } = useTranslation();
  const projectName = useScenarioStore((s) => s.projectName);
  const { platform, configuration, selectedStages, run, capabilities } = useBuildStore();

  const status: BuildStatus = run?.state ?? "ready";
  const StatusIcon = STATUS_ICON[status];
  const statusLabel = run ? t(RUN_STATUS_KEY[run.state]) : t("build.ready");
  const artifact = run?.state === "done" ? run.artifact : null;
  const packageWarning =
    selectedStages.includes("package") && capabilities?.[platform]?.package.reasons.length
      ? capabilities[platform].package.reasons.join(" · ")
      : null;

  const platformLabel = t(
    `build.platform${platform === "ios" ? "Ios" : platform === "web" ? "Web" : "Android"}`,
  );
  const configurationLabel = t(
    configuration === "debug" ? "build.configDebug" : "build.configRelease",
  );
  const stagesLabel = stagesForPlatform(platform)
    .filter((stage) => selectedStages.includes(stage))
    .map((stage) => t(`build.stage.${stage}`))
    .join(" → ");
  const canReveal = Boolean(typeof window !== "undefined" && window.electronAPI && artifact);

  return (
    <div className="space-y-3">
      <FormField label={t("build.status")}>
        <div className={STATUS_CLASS[status]}>
          <Icon
            icon={StatusIcon}
            size={12}
            className={status === "running" ? "build-spin" : undefined}
          />
          <span>{statusLabel}</span>
        </div>
      </FormField>

      <FormField label={t("tools.inspector.project")}>
        <span className="build-inspector-value">{projectName ?? t("app.noProject")}</span>
      </FormField>

      <FormField label={t("build.target")}>
        <span className="build-inspector-value">
          {t("build.targetSummary", {
            platform: platformLabel,
            configuration: configurationLabel,
          })}
        </span>
      </FormField>

      <FormField label={t("build.selectStages")}>
        <span className="build-inspector-value">{stagesLabel}</span>
      </FormField>

      <Section>
        <SectionHeader>{t("build.output")}</SectionHeader>
        <SectionBody>
          {artifact ? (
            <div className="build-inspector-output">
              <code className="build-inspector-path">{artifact}</code>
              {canReveal ? (
                <Button
                  size="sm"
                  leadingIcon={FolderOpen}
                  onClick={() => void revealPath(artifact)}
                >
                  {t("build.reveal")}
                </Button>
              ) : null}
            </div>
          ) : (
            <span className="build-inspector-muted">{t("build.outputNone")}</span>
          )}
        </SectionBody>
      </Section>

      <Section>
        <SectionHeader>{t("build.packageWarning")}</SectionHeader>
        <SectionBody>
          {packageWarning ? (
            <div className="build-inspector-warning" role="note">
              <Icon icon={AlertTriangle} size={12} />
              <span>{packageWarning}</span>
            </div>
          ) : (
            <span className="build-inspector-muted">{t("build.noWarnings")}</span>
          )}
        </SectionBody>
      </Section>
    </div>
  );
}
