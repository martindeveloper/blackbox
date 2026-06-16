import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Hammer, Play, RotateCcw, Square } from "lucide-react";
import { Icon } from "../icons/Icon.js";
import { Button } from "../ui/Button.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { useBuildStore } from "../../store/useBuildStore.js";
import {
  cancelBuild,
  clearBuildResult,
  CONFIGURATION_LABEL_KEYS,
  PLATFORM_LABEL_KEYS,
  selectedStagesAvailable,
  startBuild,
  stagesForPlatform,
  subscribeBuild,
} from "../../lib/buildApi.js";
import { subscribeProject } from "../../lib/projectApi.js";
import { PlatformConfigPicker } from "./PlatformConfigPicker.js";
import { BuildPipeline } from "./BuildPipeline.js";
import { BuildLog } from "./BuildLog.js";

function scenarioPreflightChanged(changedPaths: string[]) {
  return changedPaths.some(
    (changed) => changed === "scenario.json" || changed.endsWith("/scenario.json"),
  );
}

export function BuildEditor() {
  const { t } = useTranslation();
  const projectId = useScenarioStore((s) => s.projectId);
  const projectName = useScenarioStore((s) => s.projectName);
  const platform = useBuildStore((s) => s.platform);
  const configuration = useBuildStore((s) => s.configuration);
  const reactCompiler = useBuildStore((s) => s.reactCompiler);
  const selectedStages = useBuildStore((s) => s.selectedStages);
  const run = useBuildStore((s) => s.run);
  const log = useBuildStore((s) => s.log);
  const capabilities = useBuildStore((s) => s.capabilities);
  const setPlatform = useBuildStore((s) => s.setPlatform);
  const setConfiguration = useBuildStore((s) => s.setConfiguration);
  const setReactCompiler = useBuildStore((s) => s.setReactCompiler);
  const toggleStage = useBuildStore((s) => s.toggleStage);
  const refreshPreflight = useBuildStore((s) => s.refreshPreflight);
  const applyEvent = useBuildStore((s) => s.applyEvent);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const unsubscribe = subscribeBuild(projectId, applyEvent);
    return unsubscribe;
  }, [projectId, applyEvent]);

  useEffect(() => {
    if (!projectId) return;
    void refreshPreflight(projectId);
  }, [projectId, refreshPreflight]);

  useEffect(() => {
    if (!projectId) return;
    const unsubscribe = subscribeProject(
      projectId,
      (event) => {
        if (scenarioPreflightChanged(event.changedPaths)) {
          void refreshPreflight(projectId);
        }
      },
      { includeOwnClient: true },
    );
    return unsubscribe;
  }, [projectId, refreshPreflight]);

  const running = run?.state === "running";
  const platformCapability = capabilities?.[platform];
  const platformAvailable = platformCapability?.available ?? true;
  const stagesAvailable = selectedStagesAvailable(platformCapability, selectedStages);
  const canRun =
    Boolean(projectId) &&
    !running &&
    platformAvailable &&
    stagesAvailable &&
    selectedStages.length > 0;

  const onRun = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    try {
      await startBuild(projectId, {
        platform,
        configuration,
        stages: selectedStages,
        reactCompiler,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [projectId, platform, configuration, selectedStages, reactCompiler]);

  const onCancel = useCallback(async () => {
    if (!projectId || !run) return;
    try {
      await cancelBuild(projectId, run.id);
    } catch {}
  }, [projectId, run]);

  const onClear = useCallback(async () => {
    if (!projectId || running || !run) return;
    setError(null);
    try {
      await clearBuildResult(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [projectId, running, run]);

  if (!projectId) {
    return <div className="build-empty">{t("build.openProject")}</div>;
  }

  const allSelected = selectedStages.length === stagesForPlatform(platform).length;
  const runLabel = running
    ? t("build.running")
    : allSelected
      ? t("build.runAll")
      : t("build.runSelected");
  const canClear = Boolean(run && !running);

  return (
    <div className="build-screen">
      <header className="build-header">
        <span className="build-header-icon">
          <Icon icon={Hammer} size={15} strokeWidth={2} />
        </span>
        <h1 className="build-header-title">{t("build.title")}</h1>
      </header>

      <div className="build-command-bar">
        {running ? (
          <Button variant="danger" leadingIcon={Square} onClick={onCancel}>
            {t("build.cancel")}
          </Button>
        ) : (
          <Button variant="primary" leadingIcon={Play} onClick={onRun} disabled={!canRun}>
            {runLabel}
          </Button>
        )}
        {canClear ? (
          <Button variant="ghost" leadingIcon={RotateCcw} onClick={onClear}>
            {t("build.clearResult")}
          </Button>
        ) : null}
        <span className="build-command-separator" />
        <span className="build-command-target">
          <span className="build-command-project">{projectName}</span>
          <span className="build-command-summary">
            {t("build.targetSummary", {
              platform: t(PLATFORM_LABEL_KEYS[platform]),
              configuration: t(CONFIGURATION_LABEL_KEYS[configuration]),
            })}
          </span>
        </span>
        <span className="build-command-spacer" />
        {error ? <span className="build-result build-result--error">{error}</span> : null}
      </div>

      <div className="build-options">
        <PlatformConfigPicker
          platform={platform}
          configuration={configuration}
          reactCompiler={reactCompiler}
          capabilities={capabilities}
          disabled={running}
          onPlatform={setPlatform}
          onConfiguration={setConfiguration}
          onReactCompiler={setReactCompiler}
        />
        <BuildPipeline
          platform={platform}
          selectedStages={selectedStages}
          stageRuns={run?.stages ?? []}
          disabled={running}
          onToggle={toggleStage}
        />
      </div>

      <BuildLog log={log} running={running} />
    </div>
  );
}
