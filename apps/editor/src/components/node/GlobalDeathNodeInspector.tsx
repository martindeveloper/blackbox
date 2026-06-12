import { Skull, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { catalogAssetIds } from "../../lib/catalogHealth.js";
import { translate } from "../../lib/i18n.js";
import { confirmModal } from "../../lib/modalApi.js";
import { Page } from "../../lib/pages.js";
import { editorNavigate, navigateToLibraryEntry } from "../../lib/routeHelpers.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import type { InlineNodeContent } from "../../types/wire.js";
import { CatalogRefField } from "../catalogs/CatalogRefField.js";
import { Button } from "../ui/Button.js";
import { FormField } from "../ui/FormField.js";
import { InspectorTitle } from "../ui/Heading.js";
import { Input } from "../ui/Input.js";
import { Section, SectionBody, SectionHeader } from "../ui/Section.js";
import { Select } from "../ui/Select.js";
import { TextBlockEditor } from "./TextBlockEditor.js";
import { ChoiceListEditor } from "./ChoiceListEditor.js";
import { EffectEditor } from "./EffectEditor.js";
import { MergeConfigEditor } from "./MergeConfigEditor.js";

export function GlobalDeathNodeInspector() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const bundle = useScenarioStore((s) => s.bundle);
  const updateGlobalDeathNode = useScenarioStore((s) => s.updateGlobalDeathNode);
  const deleteGlobalDeathNode = useScenarioStore((s) => s.deleteGlobalDeathNode);

  if (!bundle) return null;

  const deathNode = bundle.scenario.deathNode;
  const chapterIds = bundle.scenario.chapters.map((c) => c.id);
  const templateIds = Object.keys(bundle.library?.templates ?? {}).sort();

  const patch = (next: InlineNodeContent) => updateGlobalDeathNode(next);

  const handleCreate = () => {
    updateGlobalDeathNode({ mode: "game_over" });
  };

  const handleDelete = async () => {
    const ok = await confirmModal({
      title: translate("globalDeath.confirmDelete.title"),
      message: translate("globalDeath.confirmDelete.message"),
      variant: "danger",
      confirmLabel: translate("common.delete"),
    });
    if (!ok) return;
    deleteGlobalDeathNode();
    void editorNavigate(navigate, {
      to: Page.EditorGraph,
      search: { chapter: null, node: null, globalNode: null },
    });
  };

  if (!deathNode) {
    return (
      <div className="space-y-3 p-1">
        <div className="flex items-center gap-2">
          <Skull size={14} className="text-danger shrink-0" strokeWidth={1.5} />
          <InspectorTitle>{t("globalDeath.title")}</InspectorTitle>
        </div>
        <p className="text-[11px] text-muted">{t("globalDeath.notDefined")}</p>
        <Button size="sm" onClick={handleCreate}>
          {t("globalDeath.create")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skull size={14} className="text-danger shrink-0" strokeWidth={1.5} />
          <InspectorTitle>{t("globalDeath.title")}</InspectorTitle>
        </div>
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
      </div>

      <FormField label={t("common.title")}>
        <Input
          value={deathNode.title ?? ""}
          onChange={(e) => patch({ ...deathNode, title: e.target.value || undefined })}
        />
      </FormField>

      <CatalogRefField
        label={t("node.background")}
        ids={catalogAssetIds(bundle.assets, "textures")}
        value={deathNode.backgroundRef}
        onChange={(backgroundRef) => patch({ ...deathNode, backgroundRef })}
        category="textures"
      />

      <FormField label={t("node.mode")}>
        <Select
          options={[
            { value: "normal", label: t("node.modes.normal") },
            { value: "game_over", label: t("node.modes.game_over") },
            { value: "ending", label: t("node.modes.ending") },
          ]}
          value={deathNode.mode ?? "game_over"}
          onChange={(e) =>
            patch({ ...deathNode, mode: e.target.value as "normal" | "game_over" | "ending" })
          }
        />
      </FormField>

      <FormField label={t("node.extends")} hint={t("node.extendsHint")}>
        <Select
          options={[
            { value: "", label: t("common.none") },
            ...templateIds.map((id) => ({ value: id, label: id })),
          ]}
          value={deathNode.$extends ?? ""}
          onChange={(e) => patch({ ...deathNode, $extends: e.target.value || undefined })}
        />
        {deathNode.$extends ? (
          <Button
            size="sm"
            variant="ghost"
            icon
            title={t("library.openTemplate")}
            onClick={() => void navigateToLibraryEntry(navigate, "template", deathNode.$extends!)}
          >
            ↗
          </Button>
        ) : null}
      </FormField>

      {deathNode.$extends ? (
        <MergeConfigEditor
          merge={deathNode.$merge ?? {}}
          onChange={($merge) => patch({ ...deathNode, $merge })}
        />
      ) : null}

      <Section>
        <SectionHeader>{t("node.textBlocks")}</SectionHeader>
        <SectionBody>
          <TextBlockEditor
            entries={deathNode.text ?? []}
            onChange={(text) => patch({ ...deathNode, text })}
          />
        </SectionBody>
      </Section>

      <Section>
        <SectionHeader>{t("node.onEnter")}</SectionHeader>
        <SectionBody>
          <EffectEditor
            effects={deathNode.onEnter ?? []}
            onChange={(onEnter) => patch({ ...deathNode, onEnter })}
          />
        </SectionBody>
      </Section>

      <Section>
        <SectionHeader>{t("node.choices")}</SectionHeader>
        <SectionBody>
          <ChoiceListEditor
            choices={deathNode.choices ?? []}
            chapterIds={chapterIds}
            onChange={(choices) => patch({ ...deathNode, choices })}
          />
        </SectionBody>
      </Section>
    </div>
  );
}
