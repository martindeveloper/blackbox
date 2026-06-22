import type { ReactNode } from "react";
import { BarChart3, Compass, Flame, ScrollText, ShieldCheck, Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SimMode, SimOptions } from "@/lib/toolsApi.js";
import { SIM_GOALS_PRESETS } from "@/lib/toolsApi.js";
import { Icon } from "@/components/icons/Icon.js";
import { ToolOptionToggle } from "./ToolOptionToggle.js";

interface SimulatorOptionsPanelProps {
  options: SimOptions;
  onChange: (next: SimOptions) => void;
  disabled: boolean;
  aside?: ReactNode;
}

function NumberField({
  label,
  value,
  min,
  step,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: number;
  min: number;
  step?: number;
  onChange: (value: number) => void;
  disabled: boolean;
  placeholder?: string;
}) {
  return (
    <label className="tools-sim-field">
      <span className="tools-sim-field-label">{label}</span>
      <input
        type="number"
        className="tools-sim-field-input"
        min={min}
        step={step ?? 1}
        value={value || ""}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <label className="tools-sim-field">
      <span className="tools-sim-field-label">{label}</span>
      <select
        className="tools-sim-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

export function SimulatorOptionsPanel({
  options,
  onChange,
  disabled,
  aside,
}: SimulatorOptionsPanelProps) {
  const { t } = useTranslation();

  const setMode = (mode: SimMode) => onChange({ ...options, mode });
  const presetGoals = SIM_GOALS_PRESETS.includes(
    options.goals as (typeof SIM_GOALS_PRESETS)[number],
  );
  const goalsPreset = presetGoals
    ? (options.goals as (typeof SIM_GOALS_PRESETS)[number])
    : "custom";

  const modes: { id: SimMode; icon: typeof Target; label: string; hint: string }[] = [
    {
      id: "goals",
      icon: Target,
      label: t("tools.simulator.modeGoals"),
      hint: t("tools.simulator.modeGoalsHint"),
    },
    {
      id: "explore",
      icon: Compass,
      label: t("tools.simulator.modeExplore"),
      hint: t("tools.simulator.modeExploreHint"),
    },
  ];

  return (
    <div className="tools-sim-panel">
      <div className="tools-sim-main">
        <div className="tools-sim-modes" role="radiogroup" aria-label={t("tools.simulator.mode")}>
          {modes.map((m) => {
            const active = options.mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => setMode(m.id)}
                className={`tools-sim-mode${active ? " tools-sim-mode--active" : ""}`}
              >
                <span className="tools-sim-mode-icon" aria-hidden>
                  <Icon icon={m.icon} size={15} strokeWidth={2.2} />
                </span>
                <span className="tools-sim-mode-text">
                  <span className="tools-sim-mode-label">{m.label}</span>
                  <span className="tools-sim-mode-hint">{m.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="tools-sim-section">
          <span className="tools-sim-section-label">{t("tools.simulator.paramsLabel")}</span>
          <div className="tools-sim-grid">
            {options.mode === "goals" ? (
              <>
                <label className="tools-sim-field tools-sim-field--goals">
                  <span className="tools-sim-field-label">{t("tools.simulator.goals")}</span>
                  <div className="tools-sim-goals">
                    <select
                      className="tools-sim-select"
                      value={goalsPreset}
                      disabled={disabled}
                      onChange={(e) => {
                        const val = e.target.value;
                        onChange({ ...options, goals: val === "custom" ? "" : val });
                      }}
                    >
                      <option value="ending">{t("tools.simulator.goalsEnding")}</option>
                      <option value="game_over">{t("tools.simulator.goalsGameOver")}</option>
                      <option value="all">{t("tools.simulator.goalsAll")}</option>
                      <option value="custom">{t("tools.simulator.goalsCustom")}</option>
                    </select>
                    {goalsPreset === "custom" && (
                      <input
                        type="text"
                        className="tools-sim-field-input tools-sim-goals-custom"
                        value={options.goals}
                        placeholder={t("tools.simulator.goalsNodePlaceholder")}
                        disabled={disabled}
                        onChange={(e) => onChange({ ...options, goals: e.target.value.trim() })}
                      />
                    )}
                  </div>
                </label>
                <NumberField
                  label={t("tools.simulator.goalBudget")}
                  value={options.goalBudget}
                  min={1}
                  step={1000}
                  disabled={disabled}
                  onChange={(goalBudget) => onChange({ ...options, goalBudget })}
                />
                <SelectField
                  label={t("tools.simulator.heuristic")}
                  value={options.heuristic}
                  disabled={disabled}
                  onChange={(value) =>
                    onChange({ ...options, heuristic: value === "none" ? "none" : "graph" })
                  }
                >
                  <option value="graph">{t("tools.simulator.heuristicGraph")}</option>
                  <option value="none">{t("tools.simulator.heuristicNone")}</option>
                </SelectField>
              </>
            ) : (
              <NumberField
                label={t("tools.simulator.maxStates")}
                value={options.maxStates}
                min={1}
                step={10000}
                disabled={disabled}
                onChange={(maxStates) => onChange({ ...options, maxStates })}
              />
            )}
            <NumberField
              label={t("tools.simulator.threads")}
              value={options.threads}
              min={0}
              disabled={disabled}
              placeholder={t("tools.simulator.threadsAuto")}
              onChange={(threads) => onChange({ ...options, threads })}
            />
          </div>
        </div>

        <div className="tools-sim-section">
          <span className="tools-sim-section-label">{t("tools.simulator.outputLabel")}</span>
          <div className="tools-sim-toggles">
            <ToolOptionToggle
              icon={ShieldCheck}
              label={t("tools.simulator.check")}
              hint={t("tools.simulator.checkHint")}
              title={t("tools.simulator.checkFlag")}
              checked={options.check}
              onChange={(check) => onChange({ ...options, check })}
              disabled={disabled}
            />
            <ToolOptionToggle
              icon={ScrollText}
              label={t("tools.simulator.verbose")}
              hint={t("tools.simulator.verboseHint")}
              title={t("tools.simulator.verboseFlag")}
              checked={options.verbose}
              onChange={(verbose) => onChange({ ...options, verbose })}
              disabled={disabled}
            />
            <ToolOptionToggle
              icon={BarChart3}
              label={t("tools.simulator.analytics")}
              hint={t("tools.simulator.analyticsHint")}
              title={t("tools.simulator.analyticsFlag")}
              checked={options.analytics}
              onChange={(analytics) =>
                onChange({
                  ...options,
                  analytics,
                  storeAnalytics: analytics ? options.storeAnalytics : false,
                })
              }
              disabled={disabled}
            />
            {options.analytics && (
              <ToolOptionToggle
                icon={Flame}
                label={t("tools.simulator.storeAnalytics")}
                hint={t("tools.simulator.storeAnalyticsHint")}
                checked={options.storeAnalytics}
                onChange={(storeAnalytics) => onChange({ ...options, storeAnalytics })}
                disabled={disabled}
                nested
              />
            )}
          </div>
        </div>
      </div>
      {aside ? <aside className="tools-sim-aside">{aside}</aside> : null}
    </div>
  );
}
