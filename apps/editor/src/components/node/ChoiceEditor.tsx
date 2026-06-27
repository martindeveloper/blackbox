import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChoiceAction, ChoiceContent, RollMode, SkillCheckOutcome } from "@/types/wire.js";
import { choiceHasAdvancedFields } from "@/lib/authorEditorHelpers.js";
import { RefPickerField } from "@/components/pickers/RefPickerField.js";
import { Button } from "@/components/ui/Button.js";
import { Card } from "@/components/ui/Card.js";
import { FormField } from "@/components/ui/FormField.js";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";
import { ExprOnlyField } from "./ExprInputField.js";
import { EffectEditor } from "./EffectEditor.js";
import { GateEditor } from "./GateEditor.js";
import { AuthorDetails } from "./AuthorDetails.js";

type ResolutionMode = "goto" | "effects" | "check" | "action" | "openLoadMenu";

function getResolutionMode(choice: ChoiceContent): ResolutionMode {
  if (choice.action?.type === "openLoadMenu") return "openLoadMenu";
  if (choice.action) return "action";
  if (choice.check) return "check";
  if (choice.effects?.length) return "effects";
  return "goto";
}

interface ChoiceEditorProps {
  choice: ChoiceContent;
  chapterIds: string[];
  onChange: (choice: ChoiceContent) => void;
  onRemove: () => void;
}

function OutcomeEditor({
  label,
  outcome,
  onChange,
}: {
  label: string;
  outcome: SkillCheckOutcome;
  onChange: (o: SkillCheckOutcome) => void;
}) {
  const { t } = useTranslation();

  return (
    <Card>
      <div className="mb-2 text-[10px] uppercase text-muted-2">{label}</div>
      <RefPickerField
        kind="node"
        label={t("common.goto")}
        value={outcome.goto ?? ""}
        onChange={(goto) => onChange({ ...outcome, goto: goto || undefined })}
      />
      <div className="mt-2 text-[10px] text-muted-2">{t("common.effects")}</div>
      <EffectEditor
        effects={outcome.effects ?? []}
        onChange={(effects) => onChange({ ...outcome, effects })}
      />
    </Card>
  );
}

export function ChoiceEditor({ choice, chapterIds, onChange, onRemove }: ChoiceEditorProps) {
  const { t } = useTranslation();
  const mode = getResolutionMode(choice);
  const hasAdvanced = choiceHasAdvancedFields(choice);

  const setMode = (next: ResolutionMode) => {
    const base = {
      ...choice,
      effects: undefined,
      goto: undefined,
      check: undefined,
      action: undefined,
    };
    switch (next) {
      case "goto":
        onChange({ ...base, goto: "" });
        break;
      case "effects":
        onChange({ ...base, effects: [], goto: "" });
        break;
      case "check":
        onChange({
          ...base,
          check: {
            stat: "logic",
            difficulty: 10,
            onSuccess: { effects: [], goto: "" },
            onFailure: { effects: [], goto: "" },
          },
        });
        break;
      case "action":
        onChange({ ...base, action: { type: "gotoChapter", chapterId: chapterIds[0] ?? "" } });
        break;
      case "openLoadMenu":
        onChange({ ...base, action: { type: "openLoadMenu" } });
        break;
    }
  };

  const setAction = (action: ChoiceAction) =>
    onChange({ ...choice, action, goto: undefined, check: undefined });

  return (
    <Card variant="elevated" className="author-choice-card mb-3">
      <div className="author-card-toolbar">
        <span className="author-choice-number">{t("choice.playerChoice")}</span>
        <Button
          variant="ghost"
          size="sm"
          icon
          title={t("choice.remove")}
          aria-label={t("choice.remove")}
          onClick={onRemove}
        >
          <Trash2 size={14} />
        </Button>
      </div>

      <FormField layout="stacked" label={t("choice.playerSees")} className="author-choice-label">
        <Input
          placeholder={t("choice.labelPlaceholder")}
          value={choice.label}
          onChange={(e) => onChange({ ...choice, label: e.target.value })}
        />
      </FormField>

      <FormField label={t("choice.outcome")}>
        <Select
          options={[
            { value: "goto", label: t("choice.resolutionGoto") },
            { value: "effects", label: t("choice.resolutionEffectsGoto") },
            { value: "check", label: t("choice.resolutionCheck") },
            { value: "action", label: t("choice.resolutionAction") },
            { value: "openLoadMenu", label: t("choice.resolutionOpenLoadMenu") },
          ]}
          value={mode}
          onChange={(e) => setMode(e.target.value as ResolutionMode)}
        />
      </FormField>

      {mode === "goto" || mode === "effects" ? (
        <>
          {mode === "effects" ? (
            <EffectEditor
              effects={choice.effects ?? []}
              onChange={(effects) => onChange({ ...choice, effects })}
            />
          ) : null}
          <RefPickerField
            kind="node"
            label={t("common.goto")}
            value={choice.goto ?? ""}
            onChange={(goto) => onChange({ ...choice, goto: goto || undefined })}
          />
        </>
      ) : null}

      {mode === "check" && choice.check ? (
        <>
          <RefPickerField
            kind="stat"
            label={t("common.stat")}
            value={choice.check.stat}
            onChange={(stat) => onChange({ ...choice, check: { ...choice.check!, stat } })}
          />
          <FormField label={t("common.difficulty")}>
            <Input
              type="number"
              value={choice.check.difficulty}
              onChange={(e) =>
                onChange({
                  ...choice,
                  check: { ...choice.check!, difficulty: Number(e.target.value) },
                })
              }
            />
          </FormField>
          <FormField label={t("choice.checkLabel")}>
            <Input
              value={choice.check.label ?? ""}
              onChange={(e) =>
                onChange({
                  ...choice,
                  check: { ...choice.check!, label: e.target.value || undefined },
                })
              }
            />
          </FormField>
          <FormField label={t("choice.checkSides")}>
            <Input
              type="number"
              min={1}
              value={choice.check.sides ?? ""}
              placeholder="20"
              onChange={(e) => {
                const val = e.target.value;
                const sides = val ? Math.max(1, Number(val)) : undefined;
                onChange({
                  ...choice,
                  check: { ...choice.check!, sides: sides === 20 ? undefined : sides },
                });
              }}
            />
          </FormField>
          <FormField label={t("choice.rollMode")}>
            <Select
              options={[
                { value: "normal", label: t("choice.rollModeNormal") },
                { value: "advantage", label: t("choice.rollModeAdvantage") },
                { value: "disadvantage", label: t("choice.rollModeDisadvantage") },
              ]}
              value={choice.check.rollMode ?? "normal"}
              onChange={(e) => {
                const rollMode = e.target.value as RollMode;
                onChange({
                  ...choice,
                  check: {
                    ...choice.check!,
                    rollMode: rollMode === "normal" ? undefined : rollMode,
                  },
                });
              }}
            />
          </FormField>
          <ExprOnlyField
            label={t("choice.modifier")}
            value={choice.check.modifier}
            onChange={(modifier) => onChange({ ...choice, check: { ...choice.check!, modifier } })}
            hint={t("choice.modifierHint")}
          />
          <FormField label={t("choice.maxAttempts")}>
            <Input
              type="number"
              value={choice.check.maxAttempts ?? ""}
              placeholder={t("common.emptyDash")}
              onChange={(e) => {
                const val = e.target.value;
                onChange({
                  ...choice,
                  check: {
                    ...choice.check!,
                    maxAttempts: val ? Math.max(1, Number(val)) : undefined,
                    onExhausted: val
                      ? (choice.check!.onExhausted ?? { effects: [], goto: "" })
                      : undefined,
                  },
                });
              }}
            />
          </FormField>
          <OutcomeEditor
            label={t("choice.onSuccess")}
            outcome={choice.check.onSuccess}
            onChange={(onSuccess) =>
              onChange({ ...choice, check: { ...choice.check!, onSuccess } })
            }
          />
          <OutcomeEditor
            label={t("choice.onFailure")}
            outcome={choice.check.onFailure}
            onChange={(onFailure) =>
              onChange({ ...choice, check: { ...choice.check!, onFailure } })
            }
          />
          {choice.check.maxAttempts ? (
            <OutcomeEditor
              label={t("choice.onExhausted")}
              outcome={choice.check.onExhausted ?? { effects: [], goto: "" }}
              onChange={(onExhausted) =>
                onChange({ ...choice, check: { ...choice.check!, onExhausted } })
              }
            />
          ) : null}
        </>
      ) : null}

      {mode === "action" && choice.action ? (
        <>
          <FormField label={t("choice.actionType")}>
            <Select
              options={[
                { value: "gotoChapter", label: t("choice.actionGotoChapter") },
                { value: "restartGame", label: t("choice.actionRestartGame") },
                { value: "openMainMenu", label: t("choice.actionOpenMainMenu") },
              ]}
              value={
                choice.action.type === "restartGame"
                  ? "restartGame"
                  : choice.action.type === "openMainMenu"
                    ? "openMainMenu"
                    : "gotoChapter"
              }
              onChange={(e) => {
                if (e.target.value === "restartGame") {
                  setAction({ type: "restartGame", startNodeId: "" });
                } else if (e.target.value === "openMainMenu") {
                  setAction({ type: "openMainMenu" });
                } else {
                  setAction({ type: "gotoChapter", chapterId: chapterIds[0] ?? "" });
                }
              }}
            />
          </FormField>
          {choice.action.type === "gotoChapter" ? (
            <>
              <FormField label={t("choice.chapterId")}>
                <Select
                  options={chapterIds.map((id) => ({ value: id, label: id }))}
                  value={choice.action.chapterId}
                  onChange={(e) =>
                    setAction({
                      type: "gotoChapter",
                      chapterId: e.target.value,
                      nodeId:
                        choice.action?.type === "gotoChapter" ? choice.action.nodeId : undefined,
                    })
                  }
                />
              </FormField>
              <RefPickerField
                kind="node"
                label={t("choice.nodeIdOptional")}
                value={choice.action.nodeId ?? ""}
                onChange={(nodeId) => {
                  const action = choice.action;
                  if (action?.type !== "gotoChapter") return;
                  setAction({
                    type: "gotoChapter",
                    chapterId: action.chapterId,
                    nodeId: nodeId || undefined,
                  });
                }}
              />
            </>
          ) : null}
          {choice.action.type === "restartGame" ? (
            <RefPickerField
              kind="node"
              label={t("choice.startNodeId")}
              value={choice.action.startNodeId}
              onChange={(startNodeId) => setAction({ type: "restartGame", startNodeId })}
            />
          ) : null}
        </>
      ) : null}

      <AuthorDetails
        inline
        summary={t("choice.availabilityAndDetails")}
        configured={hasAdvanced}
        open={hasAdvanced}
      >
        <FormField label={t("common.id")} hint={t("choice.idHint")}>
          <Input
            mono
            value={choice.id}
            onChange={(e) => onChange({ ...choice, id: e.target.value })}
          />
        </FormField>
        <RefPickerField
          kind="sfx"
          label={t("choice.sfx")}
          value={choice.sfx ?? ""}
          onChange={(sfx) => onChange({ ...choice, sfx: sfx || undefined })}
        />
        <GateEditor
          label={t("choice.availableWhen")}
          value={choice.when}
          onChange={(when) => onChange({ ...choice, when })}
        />
        <GateEditor
          label={t("choice.hiddenWhen")}
          value={choice.unless}
          onChange={(unless) => onChange({ ...choice, unless })}
        />
        <GateEditor
          label={t("choice.requires")}
          value={choice.requires}
          onChange={(requires) => onChange({ ...choice, requires })}
        />
        <FormField label={t("choice.disabledReason")}>
          <Input
            value={choice.disabledReason ?? ""}
            onChange={(e) => onChange({ ...choice, disabledReason: e.target.value || undefined })}
          />
        </FormField>
        <FormField label={t("choice.whenDisabledReason")}>
          <Input
            value={choice.whenDisabledReason ?? ""}
            onChange={(e) =>
              onChange({ ...choice, whenDisabledReason: e.target.value || undefined })
            }
          />
        </FormField>
        <FormField label={t("choice.unlessDisabledReason")}>
          <Input
            value={choice.unlessDisabledReason ?? ""}
            onChange={(e) =>
              onChange({ ...choice, unlessDisabledReason: e.target.value || undefined })
            }
          />
        </FormField>
      </AuthorDetails>
    </Card>
  );
}
