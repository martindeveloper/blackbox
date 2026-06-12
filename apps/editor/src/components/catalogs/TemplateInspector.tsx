import { Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { catalogAssetIds } from "../../lib/catalogHealth.js";
import { buildLibraryUsageIndex, getLibraryUsages } from "../../lib/libraryUsage.js";
import { editorNavigate } from "../../lib/routeHelpers.js";
import { translate } from "../../lib/i18n.js";
import { confirmModal } from "../../lib/modalApi.js";
import { Page } from "../../lib/pages.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import type { InlineNodeContent } from "../../types/wire.js";
import { CatalogRefField } from "./CatalogRefField.js";
import { LibraryUsageSection } from "./SnippetInspector.js";
import { Button } from "../ui/Button.js";
import { FormField } from "../ui/FormField.js";
import { Input } from "../ui/Input.js";
import { Section, SectionBody, SectionHeader } from "../ui/Section.js";
import { Select } from "../ui/Select.js";
import { TextBlockEditor } from "../node/TextBlockEditor.js";
import { ChoiceListEditor } from "../node/ChoiceListEditor.js";
import { EffectEditor } from "../node/EffectEditor.js";
import { MergeConfigEditor } from "../node/MergeConfigEditor.js";

interface Props {
  templateId: string;
}

export function TemplateInspector({ templateId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const bundle = useScenarioStore((s) => s.bundle);
  const updateLibraryTemplate = useScenarioStore((s) => s.updateLibraryTemplate);
  const deleteLibraryTemplate = useScenarioStore((s) => s.deleteLibraryTemplate);

  const usageIndex = useMemo(() => (bundle ? buildLibraryUsageIndex(bundle) : new Map()), [bundle]);

  if (!bundle?.library) return null;

  const template = bundle.library.templates[templateId];
  if (!template) return null;

  const usages = getLibraryUsages(usageIndex, "template", templateId);
  const templateIds = Object.keys(bundle.library.templates)
    .filter((id) => id !== templateId)
    .sort();
  const chapterIds = bundle.scenario.chapters.map((c) => c.id);

  const patch = (patchTemplate: InlineNodeContent) =>
    updateLibraryTemplate(templateId, patchTemplate);

  const handleDelete = async () => {
    const ok = await confirmModal({
      title: translate("library.confirmDeleteTemplate.title"),
      message: translate("library.confirmDeleteTemplate.message", { id: templateId }),
      variant: "danger",
      confirmLabel: translate("common.delete"),
    });
    if (!ok) return;
    deleteLibraryTemplate(templateId);
    void editorNavigate(navigate, {
      to: Page.EditorLibrary,
      search: { libraryKind: "template", libraryEntry: null },
    });
  };

  return (
    <div className="catalog-detail catalog-detail--inspector">
      <header className="catalog-detail-header">
        <span className="font-mono text-[10px] text-muted">{templateId}</span>
        <Button
          variant="ghost"
          size="sm"
          icon
          leadingIcon={Trash2}
          className="catalog-detail-action catalog-detail-action--danger"
          aria-label={t("common.delete")}
          title={t("common.delete")}
          onClick={() => void handleDelete()}
        />
      </header>

      <div className="catalog-detail-fields space-y-3">
        <FormField label={t("common.title")}>
          <Input
            value={template.title ?? ""}
            onChange={(e) => patch({ ...template, title: e.target.value })}
          />
        </FormField>

        <CatalogRefField
          label={t("node.background")}
          ids={catalogAssetIds(bundle.assets, "textures")}
          value={template.backgroundRef}
          onChange={(backgroundRef) => patch({ ...template, backgroundRef })}
          category="textures"
        />

        <FormField label={t("node.mode")}>
          <Select
            options={[
              { value: "normal", label: t("node.modes.normal") },
              { value: "game_over", label: t("node.modes.game_over") },
              { value: "ending", label: t("node.modes.ending") },
            ]}
            value={template.mode ?? "normal"}
            onChange={(e) =>
              patch({
                ...template,
                mode: e.target.value as "normal" | "game_over" | "ending",
              })
            }
          />
        </FormField>

        <FormField label={t("node.extends")} hint={t("node.extendsHint")}>
          <Select
            options={[
              { value: "", label: t("common.none") },
              ...templateIds.map((id) => ({ value: id, label: id })),
            ]}
            value={template.$extends ?? ""}
            onChange={(e) => patch({ ...template, $extends: e.target.value || undefined })}
          />
        </FormField>

        {template.$extends ? (
          <MergeConfigEditor
            merge={template.$merge ?? {}}
            onChange={($merge) => patch({ ...template, $merge })}
          />
        ) : null}

        <Section>
          <SectionHeader>{t("node.textBlocks")}</SectionHeader>
          <SectionBody>
            <TextBlockEditor
              entries={template.text ?? []}
              onChange={(text) => patch({ ...template, text })}
            />
          </SectionBody>
        </Section>

        <Section>
          <SectionHeader>{t("node.onEnter")}</SectionHeader>
          <SectionBody>
            <EffectEditor
              effects={template.onEnter ?? []}
              onChange={(onEnter) => patch({ ...template, onEnter })}
            />
          </SectionBody>
        </Section>

        <Section>
          <SectionHeader>{t("node.choices")}</SectionHeader>
          <SectionBody>
            <ChoiceListEditor
              choices={template.choices ?? []}
              chapterIds={chapterIds}
              onChange={(choices) => patch({ ...template, choices })}
            />
          </SectionBody>
        </Section>
      </div>

      <LibraryUsageSection usages={usages} t={t} navigate={navigate} />
    </div>
  );
}
