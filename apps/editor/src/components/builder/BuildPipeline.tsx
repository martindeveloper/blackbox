import { useTranslation } from "react-i18next";
import { Check, ChevronRight, Loader2, Minus, X } from "lucide-react";
import { Icon } from "../icons/Icon.js";
import type {
  BuildPlatform,
  BuildStage,
  BuildStageSnapshot,
  StageState,
} from "../../lib/buildApi.js";
import { stagesForPlatform } from "../../lib/buildApi.js";

interface Props {
  platform: BuildPlatform;
  selectedStages: BuildStage[];
  stageRuns: BuildStageSnapshot[];
  disabled: boolean;
  onToggle: (stage: BuildStage) => void;
}

type DisplayState = StageState | "idle";

function stageStatus(stageRuns: BuildStageSnapshot[], stage: BuildStage): DisplayState {
  return stageRuns.find((s) => s.stage === stage)?.state ?? "idle";
}

function StatusMark({ state, selected }: { state: DisplayState; selected: boolean }) {
  if (state === "running") {
    return (
      <span className="build-stage-mark build-stage-mark--running">
        <Icon icon={Loader2} size={13} className="build-spin" />
      </span>
    );
  }
  if (state === "done") {
    return (
      <span className="build-stage-mark build-stage-mark--done">
        <Icon icon={Check} size={13} />
      </span>
    );
  }
  if (state === "error" || state === "canceled") {
    return (
      <span className={`build-stage-mark build-stage-mark--${state}`}>
        <Icon icon={X} size={13} />
      </span>
    );
  }
  return (
    <span className="build-stage-mark">
      <Icon icon={selected ? Check : Minus} size={13} />
    </span>
  );
}

export function BuildPipeline({ platform, selectedStages, stageRuns, disabled, onToggle }: Props) {
  const { t } = useTranslation();
  const stages = stagesForPlatform(platform);

  return (
    <section className="build-section">
      <span className="build-section-label">{t("build.stages")}</span>
      <div className="build-pipeline">
        {stages.map((stage, index) => {
          const selected = selectedStages.includes(stage);
          const state = selected ? stageStatus(stageRuns, stage) : "idle";
          return (
            <div key={stage} className="build-pipeline-item">
              <button
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => onToggle(stage)}
                className={`build-stage ${selected ? "build-stage--selected" : "build-stage--deselected"}`}
              >
                <span className="build-stage-top">
                  <span className="build-stage-name">{t(`build.stage.${stage}`)}</span>
                  <StatusMark state={state} selected={selected} />
                </span>
                <span className="build-stage-desc">{t(`build.stageHint.${stage}`)}</span>
                {state !== "idle" ? (
                  <span className={`build-stage-state build-stage-state--${state}`}>
                    {t(`build.stageState.${state}`)}
                  </span>
                ) : null}
              </button>
              {index < stages.length - 1 ? (
                <Icon icon={ChevronRight} size={15} className="build-stage-arrow" />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
