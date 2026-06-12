import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Icon } from "../icons/Icon.js";
import type { ItemAction } from "../../types/wire.js";
import { catalogAssetIds } from "../../lib/catalogHealth.js";
import { translate } from "../../lib/i18n.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { Button } from "../ui/Button.js";
import { Card } from "../ui/Card.js";
import { Checkbox } from "../ui/Checkbox.js";
import { FormField } from "../ui/FormField.js";
import { Input } from "../ui/Input.js";
import { Textarea } from "../ui/Textarea.js";
import { InspectorDeleteHeader } from "../ui/InspectorDeleteHeader.js";
import { Section, SectionBody, SectionHeader } from "../ui/Section.js";
import { RefPickerField } from "../pickers/RefPickerField.js";
import { EffectEditor } from "../node/EffectEditor.js";
import { GateEditor } from "../node/GateEditor.js";
import { InterpolationField } from "../node/InterpolationField.js";
import { CatalogRefField } from "./CatalogRefField.js";

interface Props {
  itemId: string;
  onDeleted: () => void;
}

export function ItemInspector({ itemId, onDeleted }: Props) {
  const { t } = useTranslation();
  const bundle = useScenarioStore((s) => s.bundle);
  const updateItem = useScenarioStore((s) => s.updateItem);
  const deleteItem = useScenarioStore((s) => s.deleteItem);

  if (!bundle || !itemId) return null;
  const item = bundle.items.items[itemId];
  if (!item) return null;

  const patch = (next: typeof item) => updateItem(itemId, next);

  const addAction = () =>
    patch({
      ...item,
      actions: [
        ...(item.actions ?? []),
        {
          id: `action_${crypto.randomUUID()}`,
          label: translate("defaults.newAction"),
          consume: true,
        },
      ],
    });

  const updateAction = (index: number, action: ItemAction) => {
    const actions = [...(item.actions ?? [])];
    actions[index] = action;
    patch({ ...item, actions });
  };

  return (
    <div className="space-y-3">
      <InspectorDeleteHeader
        id={itemId}
        titleKey="item.confirmDelete.title"
        messageKey="item.confirmDelete.message"
        messageParams={{ itemId }}
        onDelete={() => {
          deleteItem(itemId);
          onDeleted();
        }}
      />

      <FormField label={t("common.name")}>
        <Input value={item.name} onChange={(e) => patch({ ...item, name: e.target.value })} />
      </FormField>
      <FormField label={t("common.description")}>
        <Textarea
          className="min-h-[60px]"
          value={item.description}
          onChange={(e) => patch({ ...item, description: e.target.value })}
        />
      </FormField>
      <InterpolationField
        label={t("item.examineText")}
        value={item.examineText ?? ""}
        rows={3}
        onChange={(examineText) => patch({ ...item, examineText: examineText || undefined })}
      />
      <CatalogRefField
        label={t("item.iconRef")}
        textureRef={item.iconRef}
        variant="icon"
        emptyLabel={t("inspector.noIcon")}
        ids={catalogAssetIds(bundle.assets, "textures")}
        value={item.iconRef}
        onChange={(iconRef) => patch({ ...item, iconRef })}
        category="textures"
      />

      <Section>
        <SectionHeader>{t("item.actions")}</SectionHeader>
        <SectionBody>
          {(item.actions ?? []).map((action, i) => (
            <Card key={action.id} className="mb-3">
              <div className="mb-2 flex justify-end">
                <Button
                  variant="danger"
                  icon
                  title={t("item.removeAction")}
                  onClick={() =>
                    patch({ ...item, actions: item.actions?.filter((_, j) => j !== i) })
                  }
                >
                  <Icon icon={X} size={14} />
                </Button>
              </div>
              <FormField label={t("common.id")}>
                <Input
                  mono
                  value={action.id}
                  onChange={(e) => updateAction(i, { ...action, id: e.target.value })}
                />
              </FormField>
              <FormField label={t("common.label")}>
                <Input
                  value={action.label}
                  onChange={(e) => updateAction(i, { ...action, label: e.target.value })}
                />
              </FormField>
              <RefPickerField
                kind="node"
                label={t("common.goto")}
                value={action.goto ?? ""}
                onChange={(goto) => updateAction(i, { ...action, goto: goto || undefined })}
              />
              <FormField label={t("item.disabledReason")}>
                <Input
                  value={action.disabledReason ?? ""}
                  onChange={(e) =>
                    updateAction(i, { ...action, disabledReason: e.target.value || undefined })
                  }
                />
              </FormField>
              <FormField label={t("item.whenDisabledReason")}>
                <Input
                  value={action.whenDisabledReason ?? ""}
                  onChange={(e) =>
                    updateAction(i, {
                      ...action,
                      whenDisabledReason: e.target.value || undefined,
                    })
                  }
                />
              </FormField>
              <FormField label={t("item.unlessDisabledReason")}>
                <Input
                  value={action.unlessDisabledReason ?? ""}
                  onChange={(e) =>
                    updateAction(i, {
                      ...action,
                      unlessDisabledReason: e.target.value || undefined,
                    })
                  }
                />
              </FormField>
              <Checkbox
                label={t("item.consumeItem")}
                className="mb-2"
                checked={action.consume !== false}
                onChange={(e) => updateAction(i, { ...action, consume: e.target.checked })}
              />
              <GateEditor
                label={t("choice.requires")}
                value={action.requires}
                onChange={(requires) => updateAction(i, { ...action, requires })}
              />
              <GateEditor
                label={t("common.when")}
                value={action.when}
                onChange={(when) => updateAction(i, { ...action, when })}
              />
              <GateEditor
                label={t("common.unless")}
                value={action.unless}
                onChange={(unless) => updateAction(i, { ...action, unless })}
              />
              <EffectEditor
                effects={action.effects ?? []}
                onChange={(effects) => updateAction(i, { ...action, effects })}
              />
            </Card>
          ))}
          <Button size="sm" leadingIcon={Plus} onClick={addAction}>
            {t("item.addAction")}
          </Button>
        </SectionBody>
      </Section>
    </div>
  );
}
