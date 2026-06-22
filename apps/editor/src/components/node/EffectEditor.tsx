import { Plus, X } from "lucide-react";
import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Effect, ExprInput } from "@/types/wire.js";
import { useScenarioStore } from "@/store/useScenarioStore.js";
import { ObjectSelector } from "@/components/pickers/ObjectSelector.js";
import { RefPickerField } from "@/components/pickers/RefPickerField.js";
import { Icon } from "@/components/icons/Icon.js";
import { Button } from "@/components/ui/Button.js";
import { Card } from "@/components/ui/Card.js";
import { FieldRow } from "@/components/ui/FieldRow.js";
import { FormField } from "@/components/ui/FormField.js";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";
import { NumericOrExprField } from "./ExprInputField.js";
import { FlagValueField } from "./FlagValueField.js";
import { InterpolationField } from "./InterpolationField.js";

const EFFECT_TYPES = [
  "setFlag",
  "modifyStat",
  "addItem",
  "removeItem",
  "addEvent",
  "playMusic",
  "stopMusic",
  "playSfx",
  "roll",
  "modifyRelationship",
  "setActorPresent",
] as const;

function defaultEffect(type: string): Effect {
  switch (type) {
    case "setFlag":
      return { type: "setFlag", flag: "" };
    case "modifyStat":
      return { type: "modifyStat", stat: "hp", amount: 0 };
    case "addItem":
      return { type: "addItem", itemId: "", count: 1 };
    case "removeItem":
      return { type: "removeItem", itemId: "", count: 1 };
    case "addEvent":
      return { type: "addEvent", eventId: "" };
    case "playMusic":
      return { type: "playMusic", track: "" };
    case "stopMusic":
      return { type: "stopMusic" };
    case "playSfx":
      return { type: "playSfx", sfx: "" };
    case "roll":
      return { type: "roll", sides: 20 };
    case "modifyRelationship":
      return { type: "modifyRelationship", characterId: "", metric: "affinity", amount: 0 };
    case "setActorPresent":
      return { type: "setActorPresent", characterId: "", value: true };
    default:
      return { type: "setFlag", flag: "" };
  }
}

interface EffectEditorProps {
  effects: Effect[];
  onChange: (effects: Effect[]) => void;
}

function exprToDisplay(expr: ExprInput | undefined): string {
  if (expr === undefined) return "";
  if (typeof expr === "string") return expr;
  if (typeof expr === "number" || typeof expr === "boolean") return String(expr);
  return JSON.stringify(expr);
}

function EffectItem({
  effect,
  onChange,
  onRemove,
}: {
  effect: Effect;
  onChange: (e: Effect) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const bundle = useScenarioStore((s) => s.bundle);
  const [musicPicker, setMusicPicker] = useState(false);

  return (
    <Card className="mb-2">
      <div className="mb-2 flex gap-2">
        <Select
          className="flex-1"
          options={EFFECT_TYPES.map((type) => ({
            value: type,
            label: t(`effect.types.${type}`),
          }))}
          value={effect.type}
          onChange={(e) => onChange(defaultEffect(e.target.value))}
        />
        <Button variant="danger" icon title={t("effect.removeTooltip")} onClick={onRemove}>
          <Icon icon={X} size={14} />
        </Button>
      </div>

      {effect.type === "setFlag" ? (
        <>
          <RefPickerField
            kind="flag"
            label={t("common.flag")}
            value={effect.flag}
            onChange={(flag) => onChange({ ...effect, flag })}
          />
          {effect.valueExpr !== undefined ? (
            <InterpolationField
              label={t("effect.flagValueExpr")}
              value={exprToDisplay(effect.valueExpr)}
              context="effect"
              mono
              onChange={(next) =>
                onChange({ ...effect, value: undefined, valueExpr: next || undefined })
              }
            />
          ) : (
            <FlagValueField
              label={t("effect.flagValue")}
              value={effect.value}
              onChange={(value) => onChange({ ...effect, value, valueExpr: undefined })}
            />
          )}
          <FormField label={t("expr.modeExpression")}>
            <Select
              options={[
                { value: "literal", label: t("expr.modeLiteral") },
                { value: "expr", label: t("expr.modeExpression") },
              ]}
              value={effect.valueExpr !== undefined ? "expr" : "literal"}
              onChange={(e) => {
                if (e.target.value === "expr") {
                  onChange({ ...effect, value: undefined, valueExpr: "" });
                } else {
                  onChange({ ...effect, valueExpr: undefined });
                }
              }}
            />
          </FormField>
        </>
      ) : null}

      {effect.type === "modifyStat" ? (
        <>
          <RefPickerField
            kind="stat"
            label={t("common.stat")}
            value={effect.stat}
            onChange={(stat) => onChange({ ...effect, stat })}
          />
          <NumericOrExprField
            label={t("common.amount")}
            literal={effect.amount}
            expr={effect.amountExpr}
            onChange={(amount, amountExpr) => onChange({ ...effect, amount, amountExpr })}
          />
        </>
      ) : null}

      {effect.type === "addItem" || effect.type === "removeItem" ? (
        <>
          <RefPickerField
            kind="item"
            label={t("effect.itemId")}
            value={effect.itemId}
            onChange={(itemId) => onChange({ ...effect, itemId })}
          />
          <NumericOrExprField
            label={t("common.count")}
            literal={effect.count ?? 1}
            expr={effect.countExpr}
            onChange={(count, countExpr) => onChange({ ...effect, count, countExpr })}
          />
        </>
      ) : null}

      {effect.type === "addEvent" ? (
        <RefPickerField
          kind="event"
          label={t("effect.eventId")}
          value={effect.eventId}
          onChange={(eventId) => onChange({ ...effect, eventId })}
        />
      ) : null}

      {effect.type === "playMusic" ? (
        <FormField label={t("effect.trackId")}>
          <FieldRow>
            <Input
              mono
              value={effect.track}
              onChange={(e) => onChange({ ...effect, track: e.target.value })}
            />
            <button
              type="button"
              className="editor-btn editor-btn-sm editor-btn-icon"
              title={t("objectSelector.browse")}
              onClick={() => setMusicPicker(true)}
            >
              <FolderOpen size={13} />
            </button>
          </FieldRow>
          {musicPicker && bundle ? (
            <ObjectSelector
              mode={{ kind: "catalog", categories: ["music"] }}
              value={effect.track}
              title={t("effect.trackId")}
              onSelect={(v) => {
                onChange({ ...effect, track: v });
                setMusicPicker(false);
              }}
              onClose={() => setMusicPicker(false)}
            />
          ) : null}
        </FormField>
      ) : null}

      {effect.type === "playSfx" ? (
        <RefPickerField
          kind="sfx"
          label={t("effect.sfxId")}
          value={effect.sfx}
          onChange={(sfx) => onChange({ ...effect, sfx })}
        />
      ) : null}

      {effect.type === "roll" ? (
        <>
          <FormField label={t("effect.sides")}>
            <Input
              type="number"
              value={effect.sides ?? 20}
              onChange={(e) => onChange({ ...effect, sides: Number(e.target.value) })}
            />
          </FormField>
          <FormField label={t("common.label")}>
            <Input
              value={effect.label ?? ""}
              onChange={(e) => onChange({ ...effect, label: e.target.value || undefined })}
            />
          </FormField>
          <RefPickerField
            kind="flag"
            label={t("effect.storeFlag")}
            value={effect.storeFlag ?? ""}
            onChange={(storeFlag) => onChange({ ...effect, storeFlag: storeFlag || undefined })}
          />
        </>
      ) : null}

      {effect.type === "modifyRelationship" ? (
        <>
          <RefPickerField
            kind="character"
            label={t("effect.characterId")}
            value={effect.characterId}
            onChange={(characterId) => onChange({ ...effect, characterId })}
          />
          <RefPickerField
            kind="metric"
            label={t("common.metric")}
            value={effect.metric}
            characterId={effect.characterId}
            onChange={(metric) => onChange({ ...effect, metric })}
          />
          <NumericOrExprField
            label={t("common.amount")}
            literal={effect.amount}
            expr={effect.amountExpr}
            onChange={(amount, amountExpr) => onChange({ ...effect, amount, amountExpr })}
          />
        </>
      ) : null}

      {effect.type === "setActorPresent" ? (
        <>
          <RefPickerField
            kind="character"
            label={t("effect.characterId")}
            value={effect.characterId}
            onChange={(characterId) => onChange({ ...effect, characterId })}
          />
          <FormField label={t("common.value")}>
            <Select
              options={[
                { value: "true", label: t("effect.actorPresent.show") },
                { value: "false", label: t("effect.actorPresent.hide") },
              ]}
              value={String(effect.value)}
              onChange={(e) => onChange({ ...effect, value: e.target.value === "true" })}
            />
          </FormField>
        </>
      ) : null}
    </Card>
  );
}

export function EffectEditor({ effects, onChange }: EffectEditorProps) {
  const { t } = useTranslation();

  return (
    <div>
      {effects.map((e, i) => (
        <EffectItem
          key={`${e.type}:${i}`}
          effect={e}
          onChange={(next) => {
            const copy = [...effects];
            copy[i] = next;
            onChange(copy);
          }}
          onRemove={() => onChange(effects.filter((_, j) => j !== i))}
        />
      ))}
      <Button
        size="sm"
        leadingIcon={Plus}
        onClick={() => onChange([...effects, { type: "setFlag", flag: "" }])}
      >
        {t("effect.add")}
      </Button>
    </div>
  );
}
