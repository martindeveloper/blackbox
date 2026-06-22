import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  FolderOpen,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Icon } from "@/components/icons/Icon.js";
import { Button } from "@/components/ui/Button.js";
import { FormField } from "@/components/ui/FormField.js";
import { Section, SectionBody, SectionHeader } from "@/components/ui/Section.js";
import { revealPath } from "@/lib/revealPath.js";
import { useBuildStore } from "@/store/useBuildStore.js";
import { useScenarioStore } from "@/store/useScenarioStore.js";
import {
  CONFIGURATION_LABEL_KEYS,
  PLATFORM_LABEL_KEYS,
  stagesForPlatform,
  type BuildRunState,
  type PreflightCheck,
} from "@/lib/buildApi.js";

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

function PreflightCheckRow({ check }: { check: PreflightCheck }) {
  const icon = check.severity === "error" ? XCircle : AlertTriangle;
  return (
    <li className={`build-preflight-check build-preflight-check--${check.severity}`}>
      <Icon icon={icon} size={12} className="build-preflight-check-icon" />
      <span>{check.message}</span>
    </li>
  );
}

export function BuildInspector() {
  const { t } = useTranslation();
  const projectId = useScenarioStore((s) => s.projectId);
  const platform = useBuildStore((s) => s.platform);
  const configuration = useBuildStore((s) => s.configuration);
  const selectedStages = useBuildStore((s) => s.selectedStages);
  const run = useBuildStore((s) => s.run);
  const capabilities = useBuildStore((s) => s.capabilities);
  const preflightLoading = useBuildStore((s) => s.preflightLoading);
  const preflightError = useBuildStore((s) => s.preflightError);
  const refreshPreflight = useBuildStore((s) => s.refreshPreflight);

  const status: BuildStatus = run?.state ?? "ready";
  const StatusIcon = STATUS_ICON[status];
  const statusLabel = run ? t(RUN_STATUS_KEY[run.state]) : t("build.ready");
  const artifact = run?.state === "done" ? run.artifact : null;
  const platformCapability = capabilities?.[platform];
  const selectedStageChecks = selectedStages
    .map((stage) => ({
      stage,
      checks: platformCapability?.stages[stage]?.checks ?? [],
    }))
    .filter((entry) => entry.checks.length > 0);
  const canReveal = Boolean(window.electronAPI && artifact);

  const platformLabel = t(PLATFORM_LABEL_KEYS[platform]);
  const configurationLabel = t(CONFIGURATION_LABEL_KEYS[configuration]);
  const stagesLabel = stagesForPlatform(platform)
    .filter((stage) => selectedStages.includes(stage))
    .map((stage) => t(`build.stage.${stage}`))
    .join(" → ");
  const statusClass =
    status === "ready"
      ? "build-inspector-status"
      : `build-inspector-status build-inspector-status--${status}`;

  const onRefreshPreflight = () => {
    if (!projectId || preflightLoading) return;
    void refreshPreflight(projectId);
  };

  return (
    <div className="build-inspector">
      <FormField label={t("build.status")}>
        <div className={statusClass}>
          <Icon
            icon={StatusIcon}
            size={12}
            className={status === "running" ? "build-spin" : undefined}
          />
          <span>{statusLabel}</span>
        </div>
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
        <SectionHeader>
          <div className="build-preflight-header">
            <span>{t("build.preflightTitle")}</span>
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={RefreshCw}
              disabled={!projectId || preflightLoading || run?.state === "running"}
              onClick={onRefreshPreflight}
            >
              {preflightLoading ? t("build.preflightRefreshing") : t("build.preflightRefresh")}
            </Button>
          </div>
        </SectionHeader>
        <SectionBody>
          {preflightError ? (
            <div className="build-inspector-warning" role="alert">
              <Icon icon={AlertTriangle} size={12} />
              <span>{preflightError}</span>
            </div>
          ) : preflightLoading && !capabilities ? (
            <span className="build-inspector-muted">{t("build.preflightRefreshing")}</span>
          ) : selectedStageChecks.length > 0 ? (
            <ul className="build-preflight-list">
              {selectedStageChecks.map(({ stage, checks }) => (
                <li key={stage} className="build-preflight-group">
                  <span className="build-preflight-stage">{t(`build.stage.${stage}`)}</span>
                  <ul className="build-preflight-checks">
                    {checks.map((check, index) => (
                      <PreflightCheckRow key={`${stage}-${index}`} check={check} />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <span className="build-inspector-muted">{t("build.preflightOk")}</span>
          )}
        </SectionBody>
      </Section>

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
    </div>
  );
}
