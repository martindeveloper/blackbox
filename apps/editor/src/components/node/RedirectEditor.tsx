import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { RedirectRule } from "@/types/wire.js";
import { RefPickerField } from "@/components/pickers/RefPickerField.js";
import { Button } from "@/components/ui/Button.js";
import { Card } from "@/components/ui/Card.js";
import { GateEditor } from "./GateEditor.js";

interface RedirectEditorProps {
  rules: RedirectRule[];
  onChange: (rules: RedirectRule[]) => void;
}

export function RedirectEditor({ rules, onChange }: RedirectEditorProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      {rules.map((rule, i) => (
        <Card key={i} className="mb-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase text-muted-2">
              {t("node.redirectRule", { index: i + 1 })}
            </span>
            <Button
              variant="danger"
              size="sm"
              icon
              title={t("node.redirectRemove")}
              onClick={() => onChange(rules.filter((_, j) => j !== i))}
            >
              <Trash2 size={14} />
            </Button>
          </div>
          <RefPickerField
            kind="node"
            label={t("common.goto")}
            value={rule.goto}
            onChange={(goto) => {
              const copy = [...rules];
              copy[i] = { ...rule, goto };
              onChange(copy);
            }}
          />
          <GateEditor
            label={t("node.redirectWhen")}
            value={rule.when}
            onChange={(when) => {
              const copy = [...rules];
              copy[i] = { ...rule, when };
              onChange(copy);
            }}
          />
          <GateEditor
            label={t("node.redirectUnless")}
            value={rule.unless}
            onChange={(unless) => {
              const copy = [...rules];
              copy[i] = { ...rule, unless };
              onChange(copy);
            }}
          />
        </Card>
      ))}
      <Button size="sm" leadingIcon={Plus} onClick={() => onChange([...rules, { goto: "" }])}>
        {t("node.redirectAdd")}
      </Button>
    </div>
  );
}
