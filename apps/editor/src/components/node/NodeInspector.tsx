import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpenText, GitFork, SlidersHorizontal } from "lucide-react";
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
import { AuthorDetails } from "./AuthorDetails.js";
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
  const [workspace, setWorkspace] = useState<"scene" | "choices" | "setup">("scene");

  useEffect(() => {
    setRenameValue("");
    setWorkspace("scene");
  }, [chapterId, nodeId]);

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
    <div className="node-authoring">
      <header className="node-authoring-header">
        <InspectorTitle>{node.title || t("node.untitledScene")}</InspectorTitle>
        <span className="node-authoring-id">{nodeId}</span>
      </header>

      <nav className="node-authoring-tabs" aria-label={t("node.workspaceLabel")}>
        <button
          type="button"
          className={workspace === "scene" ? "is-active" : ""}
          aria-selected={workspace === "scene"}
          onClick={() => setWorkspace("scene")}
        >
          <BookOpenText size={14} />
          {t("node.scene")}
          <span>{node.text?.length ?? 0}</span>
        </button>
        <button
          type="button"
          className={workspace === "choices" ? "is-active" : ""}
          aria-selected={workspace === "choices"}
          onClick={() => setWorkspace("choices")}
        >
          <GitFork size={14} />
          {t("node.choices")}
          <span>{node.choices?.length ?? 0}</span>
        </button>
        <button
          type="button"
          className={workspace === "setup" ? "is-active" : ""}
          aria-selected={workspace === "setup"}
          onClick={() => setWorkspace("setup")}
        >
          <SlidersHorizontal size={14} />
          {t("node.advanced")}
        </button>
      </nav>

      {workspace === "scene" ? (
        <div className="node-authoring-body">
          <FormField layout="stacked" label={t("node.sceneTitle")} hint={t("node.sceneTitleHint")}>
            <Input
              value={node.title ?? ""}
              placeholder={t("node.sceneTitlePlaceholder")}
              onChange={(e) => patch({ ...node, title: e.target.value })}
            />
          </FormField>

          <TextBlockEditor
            entries={node.text ?? []}
            onChange={(text) => patch({ ...node, text })}
          />

          {snippetIds.length > 0 ? (
            <div className="node-authoring-snippets">
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
        </div>
      ) : null}

      {workspace === "choices" ? (
        <div className="node-authoring-body">
          <div className="node-authoring-section-heading">
            <strong>{t("node.choicePrompt")}</strong>
            <p>{t("node.choicePromptHint")}</p>
          </div>
          <ChoiceListEditor
            choices={node.choices ?? []}
            chapterIds={chapterIds}
            onChange={(choices) => patch({ ...node, choices })}
          />
        </div>
      ) : null}

      {workspace === "setup" ? (
        <div className="node-authoring-body">
          <div className="node-authoring-section-heading">
            <strong>{t("node.sceneSetup")}</strong>
            <p>{t("node.sceneSetupHint")}</p>
          </div>
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
          <Section>
            <SectionHeader>{t("node.onEnter")}</SectionHeader>
            <SectionBody>
              <EffectEditor
                effects={node.onEnter ?? []}
                onChange={(onEnter) => patch({ ...node, onEnter })}
              />
            </SectionBody>
          </Section>

          <AuthorDetails summary={t("node.templateAndReuse")} open={Boolean(node.$extends)}>
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
                    onClick={() =>
                      void navigateToLibraryEntry(navigate, "template", node.$extends!)
                    }
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
                      {template.title ? <p>{template.title}</p> : null}
                      {(template.text?.length ?? 0) > 0 ? (
                        <p>{t("node.templateTextBlocks", { count: template.text!.length })}</p>
                      ) : null}
                      {(template.choices?.length ?? 0) > 0 ? (
                        <p>{t("node.templateChoices", { count: template.choices!.length })}</p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-danger">
                      {t("library.unknownTemplate", { id: node.$extends })}
                    </p>
                  )}
                </SectionBody>
              </Section>
            ) : null}
          </AuthorDetails>

          <AuthorDetails summary={t("node.identityAndFlow")}>
            <FormField label={t("node.renameId")} hint={t("node.renameIdHint")}>
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
            <div className="node-authoring-actions">
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
                <>
                  <span className="text-[10px] text-danger">{t("node.isDeath")}</span>
                  <Button size="sm" variant="ghost" onClick={clearDeath}>
                    {t("node.clearDeath")}
                  </Button>
                </>
              )}
            </div>
          </AuthorDetails>
        </div>
      ) : null}
    </div>
  );
}
