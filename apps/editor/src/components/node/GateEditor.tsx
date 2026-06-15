import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Gate, GateNode } from "../../types/wire.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { RefPickerField } from "../pickers/RefPickerField.js";
import { FlagValueField } from "./FlagValueField.js";
import { Button } from "../ui/Button.js";
import { Card } from "../ui/Card.js";
import { Checkbox } from "../ui/Checkbox.js";
import { FormField } from "../ui/FormField.js";
import { Input } from "../ui/Input.js";
import { Select } from "../ui/Select.js";

const GATE_TYPES = [
  "hasItem",
  "hasFlag",
  "statGte",
  "statLte",
  "statEq",
  "visited",
  "atNode",
  "relationshipGte",
  "relationshipLte",
  "relationshipEq",
  "actorPresent",
  "condition",
  "all",
  "any",
  "not",
] as const;

interface GateEditorProps {
  value: Gate | undefined;
  onChange: (value: Gate | undefined) => void;
  label?: string;
  nested?: boolean;
  onRemove?: () => void;
}

function defaultGate(type: string): GateNode {
  switch (type) {
    case "hasItem":
      return { type: "hasItem", itemId: "", count: 1 };
    case "hasFlag":
      return { type: "hasFlag", flag: "" };
    case "statGte":
    case "statLte":
    case "statEq":
      return { type: type as "statGte", stat: "hp", value: 0 };
    case "visited":
    case "atNode":
      return { type: type as "visited", nodeId: "" };
    case "relationshipGte":
    case "relationshipLte":
    case "relationshipEq":
      return { type: type as "relationshipGte", characterId: "", metric: "affinity", value: 0 };
    case "actorPresent":
      return { type: "actorPresent", characterId: "" };
    case "condition":
      return { type: "condition", id: "" };
    case "all":
      return { type: "all", conditions: [] };
    case "any":
      return { type: "any", conditions: [] };
    case "not":
      return { type: "not", condition: { type: "hasFlag", flag: "" } };
    default:
      return { type: "hasFlag", flag: "" };
  }
}

function GateConditionsEditor({
  conditions,
  onChange,
}: {
  conditions: Gate[];
  onChange: (conditions: Gate[]) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2 border-l-2 border-border pl-2">
      {(conditions ?? []).map((cond, i) => (
        <GateEditor
          key={`${JSON.stringify(cond)}:${i}`}
          nested
          value={cond}
          onChange={(next) => {
            const copy = [...conditions];
            if (next) copy[i] = next;
            else copy.splice(i, 1);
            onChange(copy);
          }}
          onRemove={() => onChange(conditions.filter((_, j) => j !== i))}
        />
      ))}
      <Button
        size="sm"
        leadingIcon={Plus}
        onClick={() => onChange([...conditions, { type: "hasFlag", flag: "" }])}
      >
        {t("gate.addCondition")}
      </Button>
    </div>
  );
}

function GateNodeEditor({ gate, onChange }: { gate: GateNode; onChange: (g: GateNode) => void }) {
  const { t } = useTranslation();
  const bundle = useScenarioStore((s) => s.bundle);
  const conditionIds = Object.keys(bundle?.library?.conditions ?? {}).sort();

  const setType = (type: string) => onChange(defaultGate(type));

  return (
    <Card className="space-y-2">
      <Select
        options={GATE_TYPES.map((type) => ({
          value: type,
          label: t(`gate.types.${type}`),
        }))}
        value={gate.type}
        onChange={(e) => setType(e.target.value)}
      />

      {gate.type === "hasItem" ? (
        <>
          <RefPickerField
            kind="item"
            label={t("effect.itemId")}
            value={gate.itemId}
            onChange={(itemId) => onChange({ ...gate, itemId })}
          />
          <FormField label={t("common.count")}>
            <Input
              type="number"
              value={gate.count ?? 1}
              onChange={(e) => onChange({ ...gate, count: Number(e.target.value) })}
            />
          </FormField>
        </>
      ) : null}

      {gate.type === "hasFlag" ? (
        <>
          <RefPickerField
            kind="flag"
            label={t("common.flag")}
            value={gate.flag}
            onChange={(flag) => onChange({ ...gate, flag })}
          />
          <FlagValueField value={gate.value} onChange={(value) => onChange({ ...gate, value })} />
        </>
      ) : null}

      {gate.type === "statGte" || gate.type === "statLte" || gate.type === "statEq" ? (
        <>
          <RefPickerField
            kind="stat"
            label={t("common.stat")}
            value={gate.stat}
            onChange={(stat) => onChange({ ...gate, stat })}
          />
          <FormField label={t("common.value")}>
            <Input
              type="number"
              value={gate.value}
              onChange={(e) => onChange({ ...gate, value: Number(e.target.value) })}
            />
          </FormField>
        </>
      ) : null}

      {gate.type === "visited" || gate.type === "atNode" ? (
        <RefPickerField
          kind="node"
          label={t("condition.nodeId")}
          value={gate.nodeId}
          onChange={(nodeId) => onChange({ ...gate, nodeId })}
        />
      ) : null}

      {gate.type === "actorPresent" ? (
        <RefPickerField
          kind="character"
          label={t("effect.characterId")}
          value={gate.characterId}
          onChange={(characterId) => onChange({ ...gate, characterId })}
        />
      ) : null}

      {gate.type === "condition" ? (
        <FormField label={t("gate.namedCondition")}>
          <Select
            options={[
              { value: "", label: t("common.none") },
              ...conditionIds.map((id) => ({ value: id, label: id })),
            ]}
            value={gate.id}
            onChange={(e) => onChange({ ...gate, id: e.target.value })}
          />
        </FormField>
      ) : null}

      {gate.type === "relationshipGte" ||
      gate.type === "relationshipLte" ||
      gate.type === "relationshipEq" ? (
        <>
          <RefPickerField
            kind="character"
            label={t("effect.characterId")}
            value={gate.characterId}
            onChange={(characterId) => onChange({ ...gate, characterId })}
          />
          <RefPickerField
            kind="metric"
            label={t("common.metric")}
            value={gate.metric}
            characterId={gate.characterId}
            onChange={(metric) => onChange({ ...gate, metric })}
          />
          <FormField label={t("common.value")}>
            <Input
              type="number"
              value={gate.value}
              onChange={(e) => onChange({ ...gate, value: Number(e.target.value) })}
            />
          </FormField>
        </>
      ) : null}

      {gate.type === "all" || gate.type === "any" ? (
        <GateConditionsEditor
          conditions={gate.conditions ?? []}
          onChange={(conditions) => onChange({ ...gate, conditions })}
        />
      ) : null}

      {gate.type !== "all" && gate.type !== "any" && gate.type !== "not" ? (
        <FormField label={t("gate.disabledReason")}>
          <Input
            value={gate.disabledReason ?? ""}
            onChange={(e) => onChange({ ...gate, disabledReason: e.target.value || undefined })}
          />
        </FormField>
      ) : null}

      {gate.type === "not" ? (
        <GateEditor
          value={gate.condition}
          onChange={(c) => c && onChange({ ...gate, condition: c })}
          label={t("gate.condition")}
        />
      ) : null}
    </Card>
  );
}

export function GateEditor({ value, onChange, label, nested, onRemove }: GateEditorProps) {
  const { t } = useTranslation();
  const enabled = value !== undefined;

  return (
    <div className="gate-editor">
      {nested ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          {label ? <span className="text-[10px] uppercase text-muted-2">{label}</span> : null}
          {onRemove ? (
            <Button variant="danger" size="sm" leadingIcon={X} onClick={onRemove}>
              {t("common.remove")}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="gate-editor-toggle">
          {label ? <span className="gate-editor-label">{label}</span> : null}
          <Checkbox
            label={t("common.enabled")}
            checked={enabled}
            onChange={(e) => onChange(e.target.checked ? { type: "hasFlag", flag: "" } : undefined)}
          />
        </div>
      )}
      {enabled ? (
        Array.isArray(value) ? (
          <div className="space-y-2">
            {value.map((g, i) => (
              <div key={`${JSON.stringify(g)}:${i}`}>
                {Array.isArray(g) ||
                ("type" in g && (g.type === "all" || g.type === "any" || g.type === "not")) ? (
                  <GateEditor
                    nested
                    value={g}
                    onChange={(next) => {
                      const copy = [...value];
                      if (next) copy[i] = next;
                      else copy.splice(i, 1);
                      onChange(copy);
                    }}
                    onRemove={() => onChange(value.filter((_, j) => j !== i))}
                  />
                ) : (
                  <GateNodeEditor
                    gate={g as GateNode}
                    onChange={(next) => {
                      const copy = [...value];
                      copy[i] = next;
                      onChange(copy);
                    }}
                  />
                )}
              </div>
            ))}
            <Button
              size="sm"
              leadingIcon={Plus}
              onClick={() => onChange([...value, { type: "hasFlag", flag: "" }])}
            >
              {t("gate.add")}
            </Button>
          </div>
        ) : (
          <GateNodeEditor gate={value as GateNode} onChange={onChange} />
        )
      ) : null}
    </div>
  );
}
