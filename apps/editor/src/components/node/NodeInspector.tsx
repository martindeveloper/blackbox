import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { collectSnippetIdsFromText } from "../../lib/libraryRefs.js";
import { catalogAssetIds } from "../../lib/catalogHealth.js";
import { Page } from "../../lib/pages.js";
import { editorNavigate, navigateToLibraryEntry } from "../../lib/routeHelpers.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { CatalogRefField } from "../catalogs/CatalogRefField.js";
import { Button } from "../ui/Button.js";
import { FieldRow } from "../ui/FieldRow.js";
import { FormField } from "../ui/FormField.js";
import { InspectorTitle } from "../ui/Heading.js";
import { Input } from "../ui/Input.js";
import { Section, SectionBody, SectionHeader } from "../ui/Section.js";
import { Select } from "../ui/Select.js";
import { TextBlockEditor } from "./TextBlockEditor.js";
import { ChoiceListEditor } from "./ChoiceListEditor.js";
import { EffectEditor } from "./EffectEditor.js";
import { MergeConfigEditor } from "./MergeConfigEditor.js";

interface Props {
  chapterId: string;
  nodeId: string;
}

export function NodeInspector({ chapterId, nodeId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const bundle = useScenarioStore((s) => s.bundle);
  const updateNode = useScenarioStore((s) => s.updateNode);
  const renameNode = useScenarioStore((s) => s.renameNode);
  const updateChapter = useScenarioStore((s) => s.updateChapter);

  const [renameValue, setRenameValue] = useState("");

  if (!bundle || !chapterId || !nodeId) return null;

  const chapter = bundle.chapters[chapterId];
  const node = chapter?.nodes[nodeId];
  if (!chapter || !node) return null;

  const chapterIds = bundle.scenario.chapters.map((c) => c.id);
  const templateIds = Object.keys(bundle.library?.templates ?? {}).sort();
  const template = node.$extends ? bundle.library?.templates[node.$extends] : undefined;
  const snippetIds = collectSnippetIdsFromText(node.text);

  const patch = (patchNode: typeof node) => updateNode(chapterId, nodeId, patchNode);

  const handleRename = () => {
    const newId = renameValue.trim();
    if (newId && newId !== nodeId) {
      renameNode(chapterId, nodeId, newId);
      void editorNavigate(navigate, {
        to: Page.EditorGraph,
        search: { chapter: chapterId, node: newId },
      });
      setRenameValue("");
    }
  };

  const setAsStart = () => {
    updateChapter(chapterId, { ...chapter, startNodeId: nodeId });
  };

  const setAsDeath = () => {
    updateChapter(chapterId, { ...chapter, deathNodeId: nodeId });
  };

  const clearDeath = () => {
    updateChapter(chapterId, { ...chapter, deathNodeId: undefined });
  };

  const merge = node.$merge ?? {};

  return (
    <div className="space-y-3">
      <InspectorTitle>{nodeId}</InspectorTitle>

      <FormField label={t("common.title")}>
        <Input
          value={node.title ?? ""}
          onChange={(e) => patch({ ...node, title: e.target.value })}
        />
      </FormField>

      <FormField label={t("node.renameId")}>
        <FieldRow>
          <Input
            mono
            placeholder={nodeId}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
          />
          <Button size="sm" onClick={handleRename}>
            {t("common.rename")}
          </Button>
        </FieldRow>
      </FormField>

      <CatalogRefField
        label={t("node.background")}
        ids={catalogAssetIds(bundle.assets, "textures")}
        value={node.backgroundRef}
        onChange={(backgroundRef) => patch({ ...node, backgroundRef })}
        category="textures"
      />

      <FormField label={t("node.mode")}>
        <Select
          options={[
            { value: "normal", label: t("node.modes.normal") },
            { value: "game_over", label: t("node.modes.game_over") },
            { value: "ending", label: t("node.modes.ending") },
          ]}
          value={node.mode ?? "normal"}
          onChange={(e) =>
            patch({ ...node, mode: e.target.value as "normal" | "game_over" | "ending" })
          }
        />
      </FormField>

      <FormField label={t("node.extends")} hint={t("node.extendsHint")}>
        <FieldRow>
          <Select
            options={[
              { value: "", label: t("common.none") },
              ...templateIds.map((id) => ({ value: id, label: id })),
            ]}
            value={node.$extends ?? ""}
            onChange={(e) => patch({ ...node, $extends: e.target.value || undefined })}
          />
          {node.$extends ? (
            <Button
              size="sm"
              variant="ghost"
              icon
              title={t("library.openTemplate")}
              onClick={() => void navigateToLibraryEntry(navigate, "template", node.$extends!)}
            >
              <ArrowUpRight size={14} />
            </Button>
          ) : null}
        </FieldRow>
      </FormField>

      {node.$extends ? (
        <MergeConfigEditor merge={merge} onChange={($merge) => patch({ ...node, $merge })} />
      ) : null}

      {node.$extends ? (
        <Section>
          <SectionHeader>{t("node.templatePreview")}</SectionHeader>
          <SectionBody className="space-y-2 text-[10px] text-muted">
            {template ? (
              <>
                {template.title ? (
                  <p>
                    <span className="text-muted-2">{t("common.title")}: </span>
                    {template.title}
                  </p>
                ) : null}
                {template.mode && template.mode !== "normal" ? (
                  <p>
                    <span className="text-muted-2">{t("node.mode")}: </span>
                    {template.mode}
                  </p>
                ) : null}
                {(template.text?.length ?? 0) > 0 ? (
                  <p>{t("node.templateTextBlocks", { count: template.text!.length })}</p>
                ) : null}
                {(template.choices?.length ?? 0) > 0 ? (
                  <p>{t("node.templateChoices", { count: template.choices!.length })}</p>
                ) : null}
              </>
            ) : (
              <p className="text-danger">{t("library.unknownTemplate", { id: node.$extends })}</p>
            )}
          </SectionBody>
        </Section>
      ) : null}

      {snippetIds.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {snippetIds.map((id) => (
            <button
              key={id}
              type="button"
              className="graph-node-badge graph-node-badge--snippet"
              onClick={() => void navigateToLibraryEntry(navigate, "snippet", id)}
            >
              @{id}
            </button>
          ))}
        </div>
      ) : null}

      {chapter.startNodeId !== nodeId ? (
        <Button size="sm" onClick={setAsStart}>
          {t("node.setAsStart")}
        </Button>
      ) : (
        <span className="text-[10px] text-success">{t("node.isStart")}</span>
      )}

      {chapter.deathNodeId !== nodeId ? (
        <Button size="sm" onClick={setAsDeath}>
          {t("node.setAsDeath")}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-danger">{t("node.isDeath")}</span>
          <Button size="sm" variant="ghost" onClick={clearDeath}>
            {t("node.clearDeath")}
          </Button>
        </div>
      )}

      <Section>
        <SectionHeader>{t("node.textBlocks")}</SectionHeader>
        <SectionBody>
          <TextBlockEditor
            entries={node.text ?? []}
            onChange={(text) => patch({ ...node, text })}
          />
        </SectionBody>
      </Section>

      <Section>
        <SectionHeader>{t("node.onEnter")}</SectionHeader>
        <SectionBody>
          <EffectEditor
            effects={node.onEnter ?? []}
            onChange={(onEnter) => patch({ ...node, onEnter })}
          />
        </SectionBody>
      </Section>

      <Section>
        <SectionHeader>{t("node.choices")}</SectionHeader>
        <SectionBody>
          <ChoiceListEditor
            choices={node.choices ?? []}
            chapterIds={chapterIds}
            onChange={(choices) => patch({ ...node, choices })}
          />
        </SectionBody>
      </Section>
    </div>
  );
}
