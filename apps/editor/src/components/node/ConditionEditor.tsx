import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Condition } from "@/types/wire.js";
import { Icon } from "@/components/icons/Icon.js";
import { Button } from "@/components/ui/Button.js";
import { Card } from "@/components/ui/Card.js";
import { FormField } from "@/components/ui/FormField.js";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";

const CONDITION_TYPES = [
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
] as const;

interface ConditionEditorProps {
  conditions: Condition[];
  onChange: (conditions: Condition[]) => void;
}

function defaultCondition(type: string): Condition {
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
    default:
      return { type: "relationshipGte", characterId: "", metric: "affinity", value: 0 };
  }
}

function ConditionItem({
  condition,
  onChange,
  onRemove,
}: {
  condition: Condition;
  onChange: (c: Condition) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Card className="mb-2">
      <div className="mb-2 flex gap-2">
        <Select
          className="flex-1"
          options={CONDITION_TYPES.map((type) => ({
            value: type,
            label: t(`condition.types.${type}`),
          }))}
          value={condition.type}
          onChange={(e) => onChange(defaultCondition(e.target.value))}
        />
        <Button variant="danger" icon title={t("condition.removeTooltip")} onClick={onRemove}>
          <Icon icon={X} size={14} />
        </Button>
      </div>

      {condition.type === "hasItem" ? (
        <>
          <FormField label={t("effect.itemId")}>
            <Input
              mono
              value={condition.itemId}
              onChange={(e) => onChange({ ...condition, itemId: e.target.value })}
            />
          </FormField>
          <FormField label={t("common.count")}>
            <Input
              type="number"
              value={condition.count ?? 1}
              onChange={(e) => onChange({ ...condition, count: Number(e.target.value) })}
            />
          </FormField>
        </>
      ) : null}

      {condition.type === "hasFlag" ? (
        <FormField label={t("common.flag")}>
          <Input
            mono
            value={condition.flag}
            onChange={(e) => onChange({ ...condition, flag: e.target.value })}
          />
        </FormField>
      ) : null}

      {condition.type === "statGte" ||
      condition.type === "statLte" ||
      condition.type === "statEq" ? (
        <>
          <FormField label={t("common.stat")}>
            <Input
              value={condition.stat}
              onChange={(e) => onChange({ ...condition, stat: e.target.value })}
            />
          </FormField>
          <FormField label={t("common.value")}>
            <Input
              type="number"
              value={condition.value}
              onChange={(e) => onChange({ ...condition, value: Number(e.target.value) })}
            />
          </FormField>
        </>
      ) : null}

      {condition.type === "visited" || condition.type === "atNode" ? (
        <FormField label={t("condition.nodeId")}>
          <Input
            mono
            value={condition.nodeId}
            onChange={(e) => onChange({ ...condition, nodeId: e.target.value })}
          />
        </FormField>
      ) : null}

      {condition.type === "relationshipGte" ||
      condition.type === "relationshipLte" ||
      condition.type === "relationshipEq" ? (
        <>
          <FormField label={t("effect.characterId")}>
            <Input
              mono
              value={condition.characterId}
              onChange={(e) => onChange({ ...condition, characterId: e.target.value })}
            />
          </FormField>
          <FormField label={t("common.metric")}>
            <Input
              value={condition.metric}
              onChange={(e) => onChange({ ...condition, metric: e.target.value })}
            />
          </FormField>
          <FormField label={t("common.value")}>
            <Input
              type="number"
              value={condition.value}
              onChange={(e) => onChange({ ...condition, value: Number(e.target.value) })}
            />
          </FormField>
        </>
      ) : null}
    </Card>
  );
}

export function ConditionEditor({ conditions, onChange }: ConditionEditorProps) {
  const { t } = useTranslation();

  return (
    <div>
      {conditions.map((c, i) => (
        <ConditionItem
          key={JSON.stringify(c)}
          condition={c}
          onChange={(next) => {
            const copy = [...conditions];
            copy[i] = next;
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
        {t("condition.add")}
      </Button>
    </div>
  );
}
