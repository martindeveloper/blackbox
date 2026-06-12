import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ChoiceView, GameView } from "../../../engine/types/game.js";
import { isEditableTarget } from "../../../engine/lib/keyboard.js";
import { UI_FLAGS, UI_TIMING } from "../uiConfig.js";
import { LockReason } from "./LockReason.js";

const INTEL_GATE_PREFIX = "Requires flag:";

function isIntelGatedChoice(choice: ChoiceView): boolean {
  return !choice.enabled && (choice.disabledReason?.startsWith(INTEL_GATE_PREFIX) ?? false);
}

function visibleChoices(choices: ChoiceView[]): ChoiceView[] {
  return choices.filter((choice) => !isIntelGatedChoice(choice));
}

const MOBILE_DENSE_CHOICE_THRESHOLD = 3;

interface ChoiceListProps {
  view: GameView;
  isGameOver: boolean;
  isEnding: boolean;
  isTerminal: boolean;
  isRolling: boolean;
  visible: boolean;
  choiceClass: string;
  borderColor: string;
  onChoose: (choiceId: string) => void;
  onContinue: () => void;
  onReturnToChapterStart: () => void;
  onRestart: () => void;
  onOpenLoad: () => void;
  onOpenMainMenu: () => void;
}

function dispatchChoice(
  choice: ChoiceView,
  handlers: Pick<ChoiceListProps, "onChoose" | "onRestart" | "onOpenLoad" | "onOpenMainMenu">,
): void {
  if (choice.action?.type === "openLoadMenu") handlers.onOpenLoad();
  else if (choice.action?.type === "openMainMenu") handlers.onOpenMainMenu();
  else if (choice.action?.type === "restartGame") handlers.onRestart();
  else handlers.onChoose(choice.id);
}

export function ChoiceList({
  view,
  isGameOver,
  isEnding,
  isTerminal,
  isRolling,
  visible,
  choiceClass,
  borderColor,
  onChoose,
  onContinue,
  onReturnToChapterStart,
  onRestart,
  onOpenLoad,
  onOpenMainMenu,
}: ChoiceListProps) {
  const { t } = useTranslation();
  const choices = useMemo(() => visibleChoices(view.choices), [view.choices]);
  const hasScenarioChoices = !isGameOver && !isEnding && choices.length > 0;
  const denseChoices = hasScenarioChoices && choices.length >= MOBILE_DENSE_CHOICE_THRESHOLD;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!visible || isRolling) return;
      if (isEditableTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const n = parseInt(e.key, 10);
      if (isNaN(n) || n < 1 || n > 9) return;

      if (isGameOver) {
        if (n === 1) onReturnToChapterStart();
        else if (n === 2) onRestart();
        else if (n === 3) onOpenMainMenu();
        else return;
        e.preventDefault();
      } else if (isEnding) {
        if (n !== 1) return;
        e.preventDefault();
        onOpenMainMenu();
      } else if (hasScenarioChoices) {
        const choice = choices[n - 1];
        if (!choice || !choice.enabled) return;
        e.preventDefault();
        dispatchChoice(choice, { onChoose, onRestart, onOpenLoad, onOpenMainMenu });
      } else if (!isTerminal) {
        if (n === 1) {
          e.preventDefault();
          onContinue();
        }
      } else {
        if (n === 1) {
          e.preventDefault();
          onRestart();
        }
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [
    choices,
    hasScenarioChoices,
    isGameOver,
    isEnding,
    isTerminal,
    isRolling,
    visible,
    onChoose,
    onContinue,
    onOpenLoad,
    onOpenMainMenu,
    onReturnToChapterStart,
    onRestart,
  ]);

  return (
    <div
      className={`choice-list-footer flex-shrink-0 border-t px-4 sm:px-8 py-3${denseChoices ? " choice-list-footer--dense" : ""}${isGameOver ? " choice-list-footer--game-over" : ""}${isEnding ? " choice-list-footer--ending" : ""}`}
      style={{
        borderColor,
        paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 1.25rem))",
      }}
    >
      {visible && (
        <div
          className={`choice-list-shell w-full mx-auto${denseChoices ? " choice-list-shell--dense" : ""}${isGameOver ? " choice-list-shell--game-over" : ""}${isEnding ? " choice-list-shell--ending" : ""}`}
        >
          <div
            className={`section-rule response-rule mb-2${isGameOver ? " response-rule--game-over" : ""}${isEnding ? " response-rule--ending" : ""}`}
          >
            {isGameOver
              ? t("choices.incidentClosed")
              : isEnding
                ? t("choices.caseResolved")
                : t("choices.selectResponse")}
          </div>

          {isRolling ? (
            <div className="choice-resolving mb-3">
              <div className="choice-resolving-track">
                <div className="choice-resolving-beam" />
              </div>
              <span className="choice-resolving-label">{t("choices.resolving")}</span>
            </div>
          ) : (
            <div className="choice-list-stack mb-2">
              {!isGameOver &&
                hasScenarioChoices &&
                choices.map((choice, i) => {
                  const disabled = !choice.enabled;
                  const checkLabel = choice.check?.label;
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      className={`choice-btn ${choiceClass}${disabled ? " choice-item--disabled" : ""}`}
                      style={{
                        animationDelay: `${
                          UI_TIMING.choiceInitialDelayMs + i * UI_TIMING.choiceStaggerMs
                        }ms`,
                      }}
                      disabled={disabled}
                      title={
                        disabled && UI_FLAGS.showGateDetails ? choice.disabledReason : undefined
                      }
                      onClick={() => {
                        if (disabled) return;
                        dispatchChoice(choice, { onChoose, onRestart, onOpenLoad, onOpenMainMenu });
                      }}
                    >
                      <span className="choice-num">[{String(i + 1).padStart(2, "0")}]</span>
                      <span>
                        {choice.label}
                        {choice.check && (
                          <span
                            className="block mt-0.5 text-xs tracking-wide choice-check-tag"
                            style={{ fontFamily: "var(--font-mono)" }}
                          >
                            [{choice.check.stat.toUpperCase()} {t("choices.dc")}{" "}
                            {choice.check.difficulty}
                            {checkLabel ? ` · ${checkLabel}` : ""}
                            {choice.check.rollMode === "advantage" && (
                              <span className="choice-check-roll-mode choice-check-roll-mode--adv">
                                {" "}
                                · {t("choices.rollModeAdvantage")}
                              </span>
                            )}
                            {choice.check.rollMode === "disadvantage" && (
                              <span className="choice-check-roll-mode choice-check-roll-mode--dis">
                                {" "}
                                · {t("choices.rollModeDisadvantage")}
                              </span>
                            )}
                            {choice.check.maxAttempts !== undefined && (
                              <span className="choice-check-attempts">
                                {" "}
                                ·{" "}
                                {t("choices.attemptsRemaining", {
                                  remaining: Math.max(
                                    0,
                                    choice.check.maxAttempts - (choice.check.attemptsUsed ?? 0),
                                  ),
                                  max: choice.check.maxAttempts,
                                })}
                              </span>
                            )}
                            ]
                          </span>
                        )}
                        {disabled && choice.disabledReason && (
                          <LockReason
                            reason={choice.disabledReason}
                            showDetail={UI_FLAGS.showGateDetails}
                          />
                        )}
                      </span>
                    </button>
                  );
                })}

              {isGameOver && (
                <>
                  <button
                    type="button"
                    className="choice-btn choice-item choice-item--recovery"
                    style={{ animationDelay: `${UI_TIMING.choiceInitialDelayMs}ms` }}
                    onClick={onReturnToChapterStart}
                  >
                    <span className="choice-num">[01]</span>
                    <span>{t("choices.returnToChapterStart")}</span>
                  </button>
                  <button
                    type="button"
                    className="choice-btn choice-item choice-item--danger"
                    style={{
                      animationDelay: `${
                        UI_TIMING.choiceInitialDelayMs + UI_TIMING.choiceStaggerMs
                      }ms`,
                    }}
                    onClick={onRestart}
                  >
                    <span className="choice-num">[02]</span>
                    <span>{t("choices.restartInvestigation")}</span>
                  </button>
                  <button
                    type="button"
                    className="choice-btn choice-item choice-item--quiet"
                    style={{
                      animationDelay: `${
                        UI_TIMING.choiceInitialDelayMs + UI_TIMING.choiceStaggerMs * 2
                      }ms`,
                    }}
                    onClick={onOpenMainMenu}
                  >
                    <span className="choice-num">[03]</span>
                    <span>{t("choices.goToMainMenu")}</span>
                  </button>
                </>
              )}

              {!isGameOver && !hasScenarioChoices && !isTerminal && (
                <button
                  type="button"
                  className="choice-btn choice-item"
                  style={{ animationDelay: `${UI_TIMING.choiceInitialDelayMs}ms` }}
                  onClick={onContinue}
                >
                  <span className="choice-num">[01]</span>
                  <span>{t("choices.continue")}</span>
                </button>
              )}

              {isEnding && (
                <button
                  type="button"
                  className="choice-btn choice-item choice-item--success"
                  style={{ animationDelay: `${UI_TIMING.choiceInitialDelayMs}ms` }}
                  onClick={onOpenMainMenu}
                >
                  <span className="choice-num">[01]</span>
                  <span>{t("choices.goToMainMenu")}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
