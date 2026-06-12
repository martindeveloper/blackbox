import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { catalogAssetIds } from "../../lib/catalogHealth.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { Button } from "../ui/Button.js";
import { FormField } from "../ui/FormField.js";
import { Input } from "../ui/Input.js";
import { InspectorDeleteHeader } from "../ui/InspectorDeleteHeader.js";
import { Select } from "../ui/Select.js";
import { Section, SectionBody, SectionHeader } from "../ui/Section.js";
import { CatalogRefField } from "./CatalogRefField.js";

interface Props {
  characterId: string;
  onDeleted: () => void;
}

export function CharacterInspector({ characterId, onDeleted }: Props) {
  const { t } = useTranslation();
  const bundle = useScenarioStore((s) => s.bundle);
  const updateCharacter = useScenarioStore((s) => s.updateCharacter);
  const deleteCharacter = useScenarioStore((s) => s.deleteCharacter);
  const [newMetric, setNewMetric] = useState("");

  if (!bundle || !characterId) return null;
  const char = bundle.characters.characters[characterId];
  if (!char) return null;

  const patch = (next: typeof char) => updateCharacter(characterId, next);
  const metrics = char.relationships ?? {};

  const updateMetric = (metric: string, value: number) => {
    patch({ ...char, relationships: { ...metrics, [metric]: value } });
  };

  const addMetric = () => {
    const name = newMetric.trim();
    if (!name || metrics[name] !== undefined) return;
    patch({ ...char, relationships: { ...metrics, [name]: 0 } });
    setNewMetric("");
  };

  const removeMetric = (metric: string) => {
    const next = { ...metrics };
    delete next[metric];
    patch({
      ...char,
      relationships: Object.keys(next).length > 0 ? next : undefined,
    });
  };

  return (
    <div className="space-y-3">
      <InspectorDeleteHeader
        id={characterId}
        titleKey="character.confirmDelete.title"
        messageKey="character.confirmDelete.message"
        messageParams={{ characterId }}
        onDelete={() => {
          deleteCharacter(characterId);
          onDeleted();
        }}
      />

      <FormField label={t("common.name")}>
        <Input value={char.name} onChange={(e) => patch({ ...char, name: e.target.value })} />
      </FormField>
      <FormField label={t("character.subtitle")}>
        <Input
          value={char.subtitle ?? ""}
          onChange={(e) => patch({ ...char, subtitle: e.target.value || undefined })}
        />
      </FormField>
      <CatalogRefField
        label={t("character.portraitRef")}
        textureRef={char.portraitRef}
        variant="portrait"
        emptyLabel={t("inspector.noPortrait")}
        ids={catalogAssetIds(bundle.assets, "textures")}
        value={char.portraitRef}
        onChange={(portraitRef) => patch({ ...char, portraitRef })}
        category="textures"
      />
      <FormField label={t("character.voiceRef")}>
        <Select
          options={[
            { value: "", label: t("common.none") },
            ...catalogAssetIds(bundle.assets, "sfx").map((id) => ({ value: id, label: id })),
          ]}
          value={char.voiceRef ?? ""}
          onChange={(e) => patch({ ...char, voiceRef: e.target.value || undefined })}
        />
      </FormField>
      <FormField label={t("character.color")}>
        <Input
          type="color"
          value={char.color ?? "#ff6d1a"}
          onChange={(e) => patch({ ...char, color: e.target.value })}
        />
      </FormField>

      <Section>
        <SectionHeader>{t("character.relationships")}</SectionHeader>
        <SectionBody className="space-y-2">
          {Object.entries(metrics).map(([metric, value]) => (
            <div key={metric} className="flex items-end gap-2">
              <FormField label={metric} className="flex-1">
                <Input
                  type="number"
                  value={value ?? 0}
                  onChange={(e) => updateMetric(metric, Number(e.target.value))}
                />
              </FormField>
              <Button
                size="sm"
                variant="ghost"
                leadingIcon={X}
                aria-label={t("common.remove")}
                onClick={() => removeMetric(metric)}
              />
            </div>
          ))}
          <div className="flex items-end gap-2">
            <FormField label={t("character.addMetric")} className="flex-1">
              <Input
                value={newMetric}
                placeholder={t("character.metricPlaceholder")}
                onChange={(e) => setNewMetric(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addMetric();
                }}
              />
            </FormField>
            <Button size="sm" leadingIcon={Plus} onClick={addMetric}>
              {t("common.add")}
            </Button>
          </div>
        </SectionBody>
      </Section>
    </div>
  );
}
